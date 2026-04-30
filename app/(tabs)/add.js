import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from "react";
import {
  Alert,
  Keyboard,
  LogBox,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from 'react-native-calendars';
import { supabase } from '../lib/supabase';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

export default function AddMedicationScreen() {
  const params = useLocalSearchParams();

  // Data States
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loadingPatients, setLoadingPatients] = useState(true);

  // Form States
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState("consecutive");
  const [days, setDays] = useState(7);
  const [takes, setTakes] = useState([{ time: "09:00", dose: "1" }]);
  const [selectedDates, setSelectedDates] = useState([]);
  const [markedDates, setMarkedDates] = useState({});

  // UI Control States
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentTakeIndex, setCurrentTakeIndex] = useState(null);
  const [tempDate, setTempDate] = useState(new Date());

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('patients').select('*').eq('caregiver_id', user.id).order('created_at', { ascending: true });
      if (error) throw error;
      setPatients(data || []);
      if (params?.patientId && data?.length) {
        const found = data.find(p => p.id === params.patientId);
        if (found) setSelectedPatient(found);
      }
    } catch (err) { console.error(err); } finally { setLoadingPatients(false); }
  };

  // --- Functions ---
  const resetForm = () => {
    setName("");
    setScheduleType("consecutive");
    setDays(7);
    setTakes([{ time: "09:00", dose: "1" }]);
    setSelectedDates([]);
    setMarkedDates({});
    setSelectedPatient(null);
  };

  const openTimePicker = (index) => {
    Keyboard.dismiss();
    const [hours, minutes] = takes[index].time.split(':');
    const d = new Date();
    d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    setTempDate(d);
    setCurrentTakeIndex(index);
    setShowTimePicker(true);
  };

  const onTimeChange = (event, selectedTime) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selectedTime) {
      const hh = selectedTime.getHours().toString().padStart(2, '0');
      const mm = selectedTime.getMinutes().toString().padStart(2, '0');
      const updated = [...takes];
      updated[currentTakeIndex] = { ...updated[currentTakeIndex], time: `${hh}:${mm}` };
      setTakes(updated);
      setTempDate(selectedTime);
    }
  };

  const handleAddMedication = async () => {
    if (!selectedPatient || !name.trim()) return Alert.alert("Error", "Missing patient or name");
    
    try {
      const normName = name.trim();
      let { data: existingMed } = await supabase.from("medication").select("id").ilike("name", normName).maybeSingle();
      
      let medId;
      if (existingMed) {
        medId = existingMed.id;
      } else {
        const { data: newMed, error: insErr } = await supabase.from("medication").insert({ name: normName }).select("id").single();
        if (insErr && insErr.code === '23505') {
            const { data: retry } = await supabase.from("medication").select("id").ilike("name", normName).single();
            medId = retry.id;
        } else { medId = newMed.id; }
      }

      const { data: pm, error: pmErr } = await supabase.from("patient_medications").insert({
        patient_id: selectedPatient.id,
        medication_id: medId,
        schedule_type: scheduleType,
        start_date: new Date().toISOString().split("T")[0],
        num_of_days: scheduleType === "consecutive" ? days : null,
      }).select("id").single();

      if (pmErr) throw pmErr;

      await supabase.from("schedule").insert(takes.map(t => ({ patient_medication_id: pm.id, time: t.time, dose: parseFloat(t.dose) })));

      if (scheduleType === "specific" && selectedDates.length > 0) {
        await supabase.from("specific_medication_dates").insert(selectedDates.map(d => ({ patient_medication_id: pm.id, scheduled_date: d })));
      }

      Alert.alert("Success", "Medication added!");
      resetForm();
    } catch (err) { Alert.alert("Error", err.message); }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Patient Selection */}
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Select Patient</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {patients.map(p => (
              <TouchableOpacity key={p.id} style={[styles.patientChip, selectedPatient?.id === p.id && styles.patientChipSelected]} onPress={() => setSelectedPatient(p)}>
                <Text style={[styles.patientChipText, selectedPatient?.id === p.id && styles.patientChipTextSelected]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Med Name */}
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Medication Name</Text>
          <TextInput placeholder="e.g. Advil" style={styles.input} value={name} onChangeText={setName} />
        </View>

        {/* Takes List */}
        {takes.map((take, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Take {index + 1}</Text>
              {takes.length > 1 && (
                <TouchableOpacity onPress={() => setTakes(takes.filter((_, i) => i !== index))}>
                  <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={styles.column} onPress={() => openTimePicker(index)}>
                <Text style={styles.miniLabel}>Time</Text>
                <View style={styles.takeInputBox}>
                  <Ionicons name="time-outline" size={18} color="#0b4f5c" />
                  <Text style={styles.timeText}>{take.time}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.column}>
                <Text style={styles.miniLabel}>Dose</Text>
                <TextInput style={styles.takeInputBox} value={take.dose} keyboardType="numeric" onChangeText={(v) => {
                  const updated = [...takes];
                  updated[index].dose = v;
                  setTakes(updated);
                }} />
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addTakeBtn} onPress={() => setTakes([...takes, { time: "12:00", dose: "1" }])}>
          <Ionicons name="add-circle" size={20} color="#7DD1E0" />
          <Text style={styles.addTakeText}>Add another take</Text>
        </TouchableOpacity>

        {/* Schedule Toggle */}
        <View style={styles.scheduleSelector}>
          {["consecutive", "specific"].map(type => (
            <TouchableOpacity key={type} style={[styles.tab, scheduleType === type && styles.tabActive]} onPress={() => setScheduleType(type)}>
              <Text style={[styles.tabText, scheduleType === type && styles.tabTextActive]}>{type === "consecutive" ? "Consecutive" : "Specific Days"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {scheduleType === "consecutive" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Duration (Days)</Text>
            <View style={styles.counterCenter}>
              <TouchableOpacity onPress={() => setDays(Math.max(1, days - 1))}><Text style={styles.counterBtn}>−</Text></TouchableOpacity>
              <Text style={styles.counterValue}>{days}</Text>
              <TouchableOpacity onPress={() => setDays(days + 1)}><Text style={styles.counterBtn}>+</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowCalendar(true)}>
            <Ionicons name="calendar-outline" size={20} color="#0b6f7c" />
            <Text style={styles.datePickerText}>{selectedDates.length || "Select"} days selected</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={handleAddMedication}>
          <Text style={styles.submitText}>Save Medication</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Time Picker Modal */}
      {showTimePicker && (
        <Modal transparent animationType="fade" visible={showTimePicker}>
          <View style={styles.modalOverlay}>
            <View style={styles.pickerContainer}>
              <Text style={{ color: '#0b4f5c', fontWeight: 'bold', marginBottom: 15, textAlign: 'center' }}>
                Select Time
              </Text>
              
              <View style={{ backgroundColor: '#eeeeee', borderRadius: 10, padding: 10 }}>
                <DateTimePicker
                  value={tempDate}
                  mode="time"
                  is24Hour={true}
                  // 'spinner' can be buggy with themes, 'default' or 'compact' is safer on iOS
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'} 
                  onChange={onTimeChange}
                  style={{ height: 120 }} // Give it explicit height
                  textColor="#000000" // Forces black text regardless of Dark Mode
                />
              </View>

              <TouchableOpacity 
                style={styles.doneBtn} 
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={styles.doneText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Calendar Modal */}
      {showCalendar && (
        <Modal transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.calendarBox}>
              <Calendar
                onDayPress={(day) => {
                  setMarkedDates(prev => {
                    const next = { ...prev };
                    if (next[day.dateString]) {
                      delete next[day.dateString];
                      setSelectedDates(d => d.filter(x => x !== day.dateString));
                    } else {
                      next[day.dateString] = { selected: true, selectedColor: '#0a5f6a' };
                      setSelectedDates(d => [...d, day.dateString]);
                    }
                    return next;
                  });
                }}
                markedDates={markedDates}
              />
              <TouchableOpacity style={styles.doneBtn} onPress={() => setShowCalendar(false)}><Text style={styles.doneText}>Confirm</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b4f5c" },
  scrollContent: { padding: 20, paddingTop: 60 },
  label: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 10 },
  inputWrapper: { marginBottom: 20 },
  input: { backgroundColor: "#f0f0f0", borderRadius: 25, padding: 15, fontSize: 16, color: '#0b4f5c' },
  patientChip: { padding: 10, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, marginRight: 8 },
  patientChipSelected: { backgroundColor: "#7DD1E0" },
  patientChipText: { color: "#fff" },
  patientChipTextSelected: { color: "#0b4f5c", fontWeight: "bold" },
  card: { backgroundColor: "#f0f0f0", borderRadius: 25, padding: 15, marginBottom: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: "bold", color: "#0b6f7c" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  column: { flex: 1, marginHorizontal: 5 },
  miniLabel: { fontSize: 14, color: "#0b6f7c", fontWeight: "bold", marginBottom: 5 },
  takeInputBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#ddd", borderRadius: 25, height: 45, paddingHorizontal: 10 },
  timeText: { marginLeft: 5, fontWeight: "bold", color: "#0b4f5c" },
  addTakeBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  addTakeText: { color: '#7DD1E0', marginLeft: 8, fontWeight: 'bold' },
  scheduleSelector: { flexDirection: "row", gap: 5, marginBottom: 13 },
  tab: { flex: 1, padding: 15, borderRadius: 25, backgroundColor: "#f0f0f0", alignItems: "center" },
  tabActive: { backgroundColor: "#06333f" },
  tabText: { color: "#666" ,fontWeight: 'bold' },
  tabTextActive: { color: "#fff", fontWeight: 'bold' },
  counterCenter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 },
  counterBtn: { fontSize: 30, color: '#0b4f5c' },
  counterValue: { fontSize: 20, fontWeight: 'bold' },
  datePickerBtn: { backgroundColor: '#f0f0f0', padding: 15, borderRadius: 25, flexDirection: 'row', alignItems: 'center' },
  datePickerText: { marginLeft: 10, color: '#0b4f5c', fontWeight: 'bold' , fontSize: 15 },
  submitBtn: { backgroundColor: "#06333f", padding: 18, borderRadius: 20, alignItems: "center", marginTop: 20 },
  submitText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  pickerContainer: { backgroundColor: '#fff', padding: 20, borderRadius: 25 },
  calendarBox: { backgroundColor: '#fff', borderRadius: 20, padding: 15 },
  doneBtn: { backgroundColor: '#0a5f6a', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 15 },
  doneText: { color: '#fff', fontWeight: 'bold' },
});