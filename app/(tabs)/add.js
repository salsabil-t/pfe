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
  ActivityIndicator
} from "react-native";
import { Calendar } from 'react-native-calendars';
import { supabase } from '../lib/supabase';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

export default function AddMedicationScreen() {
  const params = useLocalSearchParams(); 
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState("consecutive");
  const [days, setDays] = useState(7);
  // Default dose set to "1.0" as a string for the input
  const [takes, setTakes] = useState([{ time: "09:00", dose: "1.0" }]);
  const [selectedDates, setSelectedDates] = useState([]);
  const [markedDates, setMarkedDates] = useState({});
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentTakeIndex, setCurrentTakeIndex] = useState(null);
  const [tempDate, setTempDate] = useState(new Date());

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('caregiver_id', user.id);

      if (error) throw error;
      setPatients(data || []);
      if (params?.patientId && data) {
        const found = data.find(p => p.id === params.patientId);
        if (found) setSelectedPatient(found);
      }
    } catch (error) {
      console.error("Error fetching patients:", error.message);
    } finally {
      setLoadingPatients(false);
    }
  };

  const handleAddMedication = async () => {
    if (!selectedPatient || !name.trim()) {
      Alert.alert("Error", "Please select a patient and enter a medication name.");
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: medData, error: medError } = await supabase
        .from('medication')
        .upsert({ name: name.trim(), created_by: user.id }, { onConflict: 'name,created_by' })
        .select().single();

      if (medError) throw medError;

      const { data: patientMed, error: pmError } = await supabase
        .from('patient_medications')
        .insert({
          patient_id: selectedPatient.id,
          medication_id: medData.id,
          schedule_type: scheduleType,
          start_date: new Date().toISOString().split('T')[0],
          num_of_days: scheduleType === "consecutive" ? days : null
        })
        .select().single();

      if (pmError) throw pmError;

      const takesToInsert = takes.map(take => ({
        patient_medication_id: patientMed.id,
        time: take.time,
        // Parse the string dose to a float before sending to Supabase
        dose: parseFloat(take.dose) || 1.0 
      }));
      
      await supabase.from('schedule').insert(takesToInsert);

      if (scheduleType === "specific" && selectedDates.length > 0) {
        const datesToInsert = selectedDates.map(date => ({
          patient_medication_id: patientMed.id,
          scheduled_date: date
        }));
        await supabase.from('specific_medication_dates').insert(datesToInsert);
      }

      Alert.alert("Success", `Medication added!`);
      resetForm();
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const resetForm = () => {
    setName("");
    setSelectedDates([]);
    setMarkedDates({});
    setTakes([{ time: "09:00", dose: "1.0" }]);
  };

  const openTimePicker = (index) => {
    Keyboard.dismiss(); 
    const [hours, minutes] = takes[index].time.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    setTempDate(date);
    setCurrentTakeIndex(index);
    setShowTimePicker(true);
  };

  const onTimeChange = (event, selectedTime) => {
    if (Platform.OS === 'android' && event.type === 'dismissed') {
      setShowTimePicker(false);
      return;
    }
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      const updated = [...takes];
      updated[currentTakeIndex].time = `${hours}:${minutes}`;
      setTakes(updated);
      setTempDate(selectedTime);
      if (Platform.OS === 'android') setShowTimePicker(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Patient Selector */}
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

        {/* Name Input */}
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Medication name</Text>
          <TextInput placeholder="e.g. Paracetamol" placeholderTextColor="#888" style={styles.input} value={name} onChangeText={setName} />
        </View>

        {/* Takes List */}
        {takes.map((take, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Take {index + 1}</Text>
              <TouchableOpacity onPress={() => setTakes(takes.filter((_, i) => i !== index))} disabled={takes.length === 1}>
                <Ionicons name="trash-outline" size={22} color={takes.length === 1 ? "#ccc" : "#d32f2f"} />
              </TouchableOpacity>
            </View>
            <View style={styles.row}>
              <View style={styles.column}>
                <Text style={styles.miniLabel}>Time</Text>
                <TouchableOpacity style={styles.takeInputBox} onPress={() => openTimePicker(index)}>
                  <Ionicons name="time-outline" size={18} color="#4F4F4F" />
                  <Text style={styles.timeText}>{take.time}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.column}>
                <Text style={styles.miniLabel}>Pill</Text>
                <View style={styles.takeInputBox}>
                  <TextInput 
                    style={styles.pillInput} 
                    value={take.dose} 
                    placeholder="1.0" 
                    keyboardType="decimal-pad" // Shows numbers and decimal point
                    onChangeText={(txt) => {
                      // Allow only numbers and one decimal point
                      const formatted = txt.replace(/[^0-9.]/g, '');
                      const up = [...takes]; 
                      up[index].dose = formatted; 
                      setTakes(up);
                    }} 
                  />
                </View>
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addTakeBtn} onPress={() => setTakes([...takes, { time: "12:00", dose: "1.0" }])}>
          <Ionicons name="add-circle" size={24} color="#7DD1E0" />
          <Text style={styles.addTakeText}>Add another take</Text>
        </TouchableOpacity>

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
              <TouchableOpacity onPress={() => setDays(Math.max(1, days - 1))}><Text style={styles.counterBtnBig}>−</Text></TouchableOpacity>
              <Text style={styles.counterValueBig}>{days}</Text>
              <TouchableOpacity onPress={() => setDays(days + 1)}><Text style={styles.counterBtnBig}>+</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowCalendar(true)}>
            <Ionicons name="calendar-outline" size={20} color="#0b6f7c" />
            <Text style={styles.datePickerText}>{selectedDates.length === 0 ? "Select treatment days" : `${selectedDates.length} days selected`}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={handleAddMedication}>
          <Text style={styles.submitText}>Add Medication</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Time Picker Modal */}
      {showTimePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlayBottom}>
            <View style={styles.pickerContainer}>
              <DateTimePicker value={tempDate} mode="time" display="spinner" onChange={onTimeChange} textColor="#0b4f5c" />
              <TouchableOpacity style={styles.doneBtn} onPress={() => setShowTimePicker(false)}><Text style={styles.doneText}>Confirm Time</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Calendar Modal */}
      {showCalendar && (
        <Modal transparent animationType="fade">
          <View style={styles.modalOverlayCenter}>
            <View style={styles.calendarBox}>
              <Calendar 
                onDayPress={(day) => {
                  let newMarked = { ...markedDates };
                  if (newMarked[day.dateString]) {
                    delete newMarked[day.dateString];
                    setSelectedDates(selectedDates.filter(d => d !== day.dateString));
                  } else {
                    newMarked[day.dateString] = { selected: true, selectedColor: '#0a5f6a' };
                    setSelectedDates([...selectedDates, day.dateString]);
                  }
                  setMarkedDates(newMarked);
                }} 
                markedDates={markedDates} 
                theme={{ todayBackgroundColor: '#E0E0E0', todayTextColor: '#0b4f5c', selectedDayBackgroundColor: '#0a5f6a' }} 
              />
              <TouchableOpacity style={styles.doneBtn} onPress={() => setShowCalendar(false)}><Text style={styles.doneText}>Confirm Dates</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ... styles remain the same as your previous version ...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b4f5c" },
  scrollContent: { padding: 20, paddingTop: 60 },
  label: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 10 },
  inputWrapper: { marginBottom: 20 },
  input: { backgroundColor: "#f0f0f0", borderRadius: 25, padding: 15, fontSize: 16 },
  patientChip: { padding: 10, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, marginRight: 8 },
  patientChipSelected: { backgroundColor: "#7DD1E0" },
  patientChipText: { color: "#fff" },
  patientChipTextSelected: { color: "#0b4f5c", fontWeight: "bold" },
  card: { backgroundColor: "#f0f0f0", borderRadius: 25, padding: 15, marginBottom: 15 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#0b6f7c" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  column: { flex: 1, marginHorizontal: 5 },
  miniLabel: { fontSize: 11, color: "#0b6f7c", fontWeight: "bold", marginBottom: 5, textTransform: "uppercase" },
  takeInputBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#ddd", borderRadius: 15, height: 45, paddingHorizontal: 10 },
  timeText: { marginLeft: 5, fontWeight: "bold" },
  pillInput: { flex: 1, fontWeight: "bold", textAlign: "center", color: "#0b4f5c" },
  addTakeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  addTakeText: { color: '#7DD1E0', marginLeft: 8, fontWeight: 'bold' },
  scheduleSelector: { flexDirection: "row", gap: 10, marginBottom: 15 },
  tab: { flex: 1, padding: 12, borderRadius: 15, backgroundColor: "#f0f0f0", alignItems: "center" },
  tabActive: { backgroundColor: "#06333f" },
  tabText: { fontWeight: "600", color: "#666" },
  tabTextActive: { color: "#fff" },
  counterCenter: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20 },
  counterBtnBig: { fontSize: 30, color: "#0b6f7c" },
  counterValueBig: { fontSize: 24, fontWeight: "bold" },
  datePickerBtn: { flexDirection: "row", backgroundColor: "#f0f0f0", padding: 15, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  datePickerText: { marginLeft: 10, fontWeight: "bold", color: "#0b6f7c" },
  submitBtn: { backgroundColor: "#06333f", padding: 18, borderRadius: 20, alignItems: "center", marginTop: 20, marginBottom: 40 },
  submitText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  modalOverlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  pickerContainer: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  calendarBox: { backgroundColor: '#fff', borderRadius: 25, padding: 15 },
  doneBtn: { backgroundColor: '#0a5f6a', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 15 },
  doneText: { color: '#fff', fontWeight: 'bold' }
});