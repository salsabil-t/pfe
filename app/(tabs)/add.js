import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

// Android sometimes shows warnings related to push notification configuration so we ignore them as long as they don't affect functionality
LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

// ── Returns today's date as "YYYY-MM-DD" in LOCAL time (not UTC) ──
const getLocalDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0'); // getMonth() is zero-indexed, so we add 1. padStart ensures two digits with leading zero if needed.
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// iOS caps local notifications at 64. Leave a 14-slot buffer. 
const IOS_NOTIF_SAFE_LIMIT = 50;

export default function AddMedicationScreen() {
  const params = useLocalSearchParams(); // useLocalSearchParams() to receive navigation parameters from previous screens like selected patient ID

  // ── Data states ──────────────────────────────────────────────────────────
  const [patients, setPatients]               = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loadingPatients, setLoadingPatients] = useState(true);

  // ── Form states ──────────────────────────────────────────────────────────
  const [name, setName]                   = useState("");
  const [scheduleType, setScheduleType]   = useState("consecutive");
  const [days, setDays]                   = useState(7);
  const [takes, setTakes]                 = useState([{ time: "09:00", dose: "1" }]);
  const [selectedDates, setSelectedDates] = useState([]);
  const [markedDates, setMarkedDates]     = useState({});

  // per-take dose validation error messages ───────────────────────
  const [doseErrors, setDoseErrors] = useState([null]);

  // submission loading guard ─────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── UI control states ────────────────────────────────────────────────────
  const [showCalendar, setShowCalendar]         = useState(false);
  const [showTimePicker, setShowTimePicker]     = useState(false);
  const [currentTakeIndex, setCurrentTakeIndex] = useState(null);
  const [tempDate, setTempDate]                 = useState(new Date());

  useEffect(() => { fetchPatients(); }, []);

  // ── Fetch caregiver's patients ───────────────────────────────────────────
  const fetchPatients = async () => {
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) return; // not authenticated, can't fetch patients

      const { data, error } = await supabase
        .from('patients')
        .select('id, name, age, disease, phone_number')
        .eq('caregiver_id', user.id)
        .order('created_at', { ascending: true }); // order by creation time to show most recent patients first

      if (error) throw error;
      setPatients(data || []);

      if (params?.patientId && data?.length) { // if we have a patientId param, try to pre-select that patient in the form
        const found = data.find(p => p.id === params.patientId);
        if (found) setSelectedPatient(found);
      }
    } catch (err) {
      console.error('[fetchPatients]', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  // ── Reset the entire form ────────────────────────────────────────────────
  const resetForm = () => {
    setName("");
    setScheduleType("consecutive");
    setDays(7);
    setTakes([{ time: "09:00", dose: "1" }]);
    setSelectedDates([]);
    setMarkedDates({});
    setSelectedPatient(null);
    setDoseErrors([null]);
  };

  // ── Time picker helpers ──────────────────────────────────────────────────
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
      const hh = selectedTime.getHours().toString().padStart(2, '0'); // padStart(2, '0') ensures that single-digit hours are displayed with a leading zero (e.g., "09")
      const mm = selectedTime.getMinutes().toString().padStart(2, '0');
      const updated = [...takes];
      updated[currentTakeIndex] = { ...updated[currentTakeIndex], time: `${hh}:${mm}` }; // copy the existing take object and only update the time property
      setTakes(updated);
      setTempDate(selectedTime);
    }
  };

  // validate every take's dose before submission 
  const validateDoses = () => {
    const errors = takes.map((take, i) => {
      const parsed = parseFloat(take.dose);
      if (!take.dose.trim() || isNaN(parsed) || parsed <= 0) {
        return `Take ${i + 1}: enter a positive number`;
      }
      return null;
    });
    setDoseErrors(errors);
    return errors.every(e => e === null);
  };

  // ── Dose input change — strip non-numeric characters immediately ─────────
  const handleDoseChange = (value, index) => {
    // Allow digits and a single decimal point only
    const cleaned = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    const updated = [...takes]; // This creates a COPY of the array. Because React state should NEVER be modified directly.
    updated[index] = { ...updated[index], dose: cleaned };
    setTakes(updated);

    // Clear that take's error as soon as the user edits it, without it error message would stay visible even after user corrected input
    if (doseErrors[index]) {
      const newErrors = [...doseErrors];
      newErrors[index] = null;
      setDoseErrors(newErrors);
    }
  };

  // ── Schedule local notifications + store followup IDs in AsyncStorage ────
  const scheduleMedicationNotifications = async (
    patientName,
    medName,
    pmId,
    insertedIntakeTimes   // array of { id } from the DB insert
  ) => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        "Permission Required",
        "Notification permission is needed to send medication reminders."
      );
      return;
    }

    // ── Bug 1: count how many notifications this prescription will create ──
    const iterations    = scheduleType === "consecutive" ? days : selectedDates.length;
    const newNotifCount = takes.length * iterations * 2; // main + followup each

    if (Platform.OS === 'ios') {
      const pending      = await Notifications.getAllScheduledNotificationsAsync();
      const currentCount = pending.length;

      if (currentCount + newNotifCount > IOS_NOTIF_SAFE_LIMIT) {
        Alert.alert(
          "Reminder Limit Warning",
          `This prescription requires ${newNotifCount} reminders, but only ` +
          `${IOS_NOTIF_SAFE_LIMIT - currentCount} slots remain before hitting ` +
          `the iOS device limit (64). Some reminders may not be delivered. ` +
          `Consider using a shorter duration or fewer daily takes.`
        );
        // We do NOT abort — we warn and continue scheduling what we can.
      }
    }

    const followupIdsToStore = {}; // { [storageKey]: notifIdentifier }

    for (const [takeIdx, take] of takes.entries()) {
      const [hours, minutes] = take.time.split(':').map(Number);
      const intakeTimeId     = insertedIntakeTimes[takeIdx]?.id ?? null;

      for (let i = 0; i < iterations; i++) {
        const triggerDate = new Date();
        if (scheduleType === "consecutive") {
          triggerDate.setDate(triggerDate.getDate() + i);
        } else {
          // Parse "YYYY-MM-DD" as LOCAL date — avoids the UTC midnight shift bug
          const [year, month, day] = selectedDates[i].split('-').map(Number);
          triggerDate.setFullYear(year, month - 1, day);
        }
        triggerDate.setHours(hours, minutes, 0, 0);
        if (triggerDate <= new Date()) continue; // skip times already in the past

        // Main reminder notification
        // ✅ MODIFICATION : intake_time_id (snake_case) ajouté dans data
        // pour permettre l'annulation de la notification quand le patient
        // confirme la prise avant l'heure prévue
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ Medication Time - ${patientName}`,
            body:  `💊 ${take.time} — ${patientName}, take your ${medName} (${take.dose} pill(s))`,
            sound: 'alarm_sounds.wav',
            data: {
              type:           'medication_reminder',
              pmId,
              intake_time_id: intakeTimeId, // ✅ MODIFIÉ : snake_case pour compatibilité avec confirmation.js
              patientName,
              dose:           take.dose,
              time:           take.time,
            },
          },
          trigger: { type: 'date', date: triggerDate },
        });

        // Follow-up "missed" notification 10 minutes later
        const reminderDate       = new Date(triggerDate.getTime() + 10 * 60000);
        const followupIdentifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: `🚨 Medication Missed - ${patientName}`,
            body:  `💊 ${patientName} missed ${medName} at ${take.time} (${take.dose} pill(s))`,
            sound: 'alarm_sounds.wav',
            data: {
              type:           'medication_missed',
              intake_time_id: intakeTimeId, 
            },
          },
          trigger: { type: 'date', date: reminderDate },
        });

        if (intakeTimeId) {
          const dateKey    = 
            `${triggerDate.getFullYear()}-` +
            `${String(triggerDate.getMonth() + 1).padStart(2, '0')}-` +
            `${String(triggerDate.getDate()).padStart(2, '0')}`;
          const storageKey = `followup_${intakeTimeId}_${dateKey}`;
          followupIdsToStore[storageKey] = followupIdentifier;
        }
      }
    }

    // Merge and persist all followup IDs
    if (Object.keys(followupIdsToStore).length > 0) {
      try {
        const raw      = await AsyncStorage.getItem('followup_notif_ids');
        const existing = raw ? JSON.parse(raw) : {};
        await AsyncStorage.setItem(
          'followup_notif_ids',
          JSON.stringify({ ...existing, ...followupIdsToStore })
        );
      } catch (e) {
        console.warn('[AsyncStorage] Could not save followup IDs:', e);
      }
    }
  };

  // ── Main save handler ────────────────────────────────────────────────────
  const handleAddMedication = async () => {
    // prevent double-tap submission
    if (isSubmitting) return;

    // ── Guard clauses ────────────────────────────────────────────────────
    if (!selectedPatient) {
      return Alert.alert("Error", "Please select a patient.");
    }
    if (!name.trim()) {
      return Alert.alert("Error", "Please enter a medication name.");
    }
    if (scheduleType === "specific" && selectedDates.length === 0) {
      return Alert.alert("Error", "Please select at least one date.");
    }

    // validate doses before any network call
    if (!validateDoses()) {
      return Alert.alert(
        "Invalid Dose",
        "Please enter valid positive numbers for all dose fields."
      );
    }

    setIsSubmitting(true);

    // Track IDs created so we can roll back on failure 
    let createdPrescriptionId = null;
    try {
      const normName = name.trim();

      // ── Step 1: find or create the medication record ─────────────────
      let { data: existingMed } = await supabase
        .from("medication")
        .select("id")
        .ilike("name", normName) // ilike means case-insensitive search ex: paracetamol and Paracetamol will be considered the same medication
        .maybeSingle(); // instead of .select() which throws error if not found, maybeSingle returns null if not found without throwing error

      let medId;
      if (existingMed) {
        medId = existingMed.id;
      } else {
        const { data: newMed, error: insErr } = await supabase
          .from("medication")
          .insert({ name: normName })
          .select("id")
          .single();

        if (insErr?.code === '23505') { // '23505' is the error code for UNIQUE CONSTRAINT VIOLATION
          // Race condition: another device inserted the same name in parallel
          const { data: retry } = await supabase
            .from("medication")
            .select("id")
            .ilike("name", normName)
            .single();
          medId = retry.id;
        } else {
          if (insErr) throw insErr;
          medId = newMed.id;
        }
      }

      // ── Step 2: create the prescription ─────────────────────────────
      const { data: pm, error: pmErr } = await supabase
        .from("prescription")
        .insert({
          patient_id:    selectedPatient.id,
          medication_id: medId,
          schedule_type: scheduleType,
          start_date:    getLocalDateString(),
          num_of_days:   scheduleType === "consecutive" ? days : null,
        })
        .select("id")
        .single();

      if (pmErr) throw pmErr;
      createdPrescriptionId = pm.id; // save for potential rollback

      // ── Step 3: insert intake_time rows ─────────────────────────────
      const { data: insertedIntakeTimes, error: intakeErr } = await supabase
        .from("intake_time")
        .insert(
          takes.map(t => ({
            prescription_id: pm.id,
            time:            t.time,
            dose:            parseFloat(t.dose), // already validated above
          }))
        )
        .select("id"); // need IDs for followup notification storage

      if (intakeErr) throw intakeErr;

      // ── Step 4: insert specific dates (if applicable) ────────────────
      if (scheduleType === "specific" && selectedDates.length > 0) {
        const { error: datesErr } = await supabase
          .from("specific_medication_dates")
          .insert(
            selectedDates.map(d => ({
              prescription_id: pm.id,
              scheduled_date:  d,
            }))
          );
        if (datesErr) throw datesErr;
      }

      // ── Step 5: schedule notifications ONLY after all DB writes succeed ──
      await scheduleMedicationNotifications(
        selectedPatient.name,
        normName,
        pm.id,
        insertedIntakeTimes || []
      );

      Alert.alert(
        "Success",
        `Medication "${normName}" added for ${selectedPatient.name}!`
      );
      resetForm();
    } catch (err) {
      console.error('[handleAddMedication]', err);

      // rollback — delete the prescription if it was created If: intake insert fails
      // Supabase cascading deletes will remove intake_times and specific_medication_dates automatically.
      if (createdPrescriptionId) {
        try {
          await supabase
            .from("prescription")
            .delete()
            .eq("id", createdPrescriptionId);
          console.log('[Rollback] Cleaned up prescription', createdPrescriptionId);
        } catch (rollbackErr) {
          console.error('[Rollback] Failed:', rollbackErr);
        }
      }

      Alert.alert(
        "Error",
        err.message + "\n\nAny partially saved data has been removed. Please try again."
      );
    } finally {
      // always re-enable the button
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Patient Selection ─────────────────────────────────────────── */}
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Select Patient</Text>
          {loadingPatients ? (
            <Text style={styles.dimText}>Loading patients…</Text>
          ) : patients.length === 0 ? (
            <Text style={styles.dimText}>
              No patients found. Add a patient on the Home screen first.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {patients.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.patientChip,
                    selectedPatient?.id === p.id && styles.patientChipSelected,
                  ]}
                  onPress={() => setSelectedPatient(p)}
                >
                  <Text
                    style={[
                      styles.patientChipText,
                      selectedPatient?.id === p.id && styles.patientChipTextSelected,
                    ]}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Medication Name ───────────────────────────────────────────── */}
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Medication Name</Text>
          <TextInput
            placeholder="e.g. Advil"
            placeholderTextColor="#aaa"
            style={styles.input}
            value={name}
            onChangeText={setName}
          />
        </View>

        {/* ── Takes ─────────────────────────────────────────────────────── */}
        {takes.map((take, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Take {index + 1}</Text>
              {takes.length > 1 && (
                <TouchableOpacity
                  onPress={() => {
                    setTakes(takes.filter((_, i) => i !== index));
                    setDoseErrors(doseErrors.filter((_, i) => i !== index));
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.row}>
              {/* Time picker button */}
              <TouchableOpacity
                style={styles.column}
                onPress={() => openTimePicker(index)}
              >
                <Text style={styles.miniLabel}>Time</Text>
                <View style={styles.takeInputBox}>
                  <Ionicons name="time-outline" size={18} color="#0b4f5c" />
                  <Text style={styles.timeText}>{take.time}</Text>
                </View>
              </TouchableOpacity>

              {/* Dose input */}
              <View style={styles.column}>
                <Text style={styles.miniLabel}>Dose (pills)</Text>
                <TextInput
                  style={[
                    styles.takeInputBox,
                    doseErrors[index] ? styles.takeInputBoxError : null,
                  ]}
                  value={take.dose}
                  keyboardType="decimal-pad"           // numeric-only keyboard
                  onChangeText={v => handleDoseChange(v, index)}
                  placeholder="e.g. 1"
                  placeholderTextColor="#999"
                />
                {/* Inline error message */}
                {doseErrors[index] ? (
                  <Text style={styles.errorText}>{doseErrors[index]}</Text>
                ) : null}
              </View>
            </View>
          </View>
        ))}

        {/* ── Add another take ──────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.addTakeBtn}
          onPress={() => {
            setTakes([...takes, { time: "12:00", dose: "1" }]);
            setDoseErrors([...doseErrors, null]);
          }}
        >
          <Ionicons name="add-circle" size={20} color="#7DD1E0" />
          <Text style={styles.addTakeText}>Add another take</Text>
        </TouchableOpacity>

        {/* ── Schedule Type Toggle ──────────────────────────────────────── */}
        <View style={styles.scheduleSelector}>
          {["consecutive", "specific"].map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.tab, scheduleType === type && styles.tabActive]}
              onPress={() => setScheduleType(type)}
            >
              <Text style={[
                styles.tabText,
                scheduleType === type && styles.tabTextActive
              ]}>
                {type === "consecutive" ? "Consecutive" : "Specific Days"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Consecutive counter OR calendar picker ────────────────────── */}
        {scheduleType === "consecutive" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Duration (Days)</Text>
            <View style={styles.counterCenter}>
              <TouchableOpacity onPress={() => setDays(Math.max(1, days - 1))}>
                <Text style={styles.counterBtn}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{days}</Text>
              <TouchableOpacity onPress={() => setDays(days + 1)}>
                <Text style={styles.counterBtn}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.datePickerBtn}
            onPress={() => setShowCalendar(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#0b6f7c" />
            <Text style={styles.datePickerText}>
              {selectedDates.length > 0
                ? `${selectedDates.length} days selected`
                : "Select dates"}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Submit button ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          onPress={handleAddMedication}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Save Medication</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* ── Time Picker Modal ─────────────────────────────────────────────── */}
      {showTimePicker && (
        <Modal transparent animationType="fade" visible={showTimePicker}>
          <View style={styles.modalOverlay}>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerTitle}>Select Time</Text>
              <View style={styles.pickerInner}>
                <DateTimePicker
                  value={tempDate}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onTimeChange}
                  style={{ height: 120 }}
                  textColor="#000000"
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

      {/* ── Calendar Modal ────────────────────────────────────────────────── */}
      {showCalendar && (
        <Modal transparent animationType="fade" visible={showCalendar}>
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
                      next[day.dateString] = {
                        selected: true,
                        selectedColor: '#0a5f6a'
                      };
                      setSelectedDates(d => [...d, day.dateString]);
                    }
                    return next;
                  });
                }}
                markedDates={markedDates}
              />
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setShowCalendar(false)}
              >
                <Text style={styles.doneText}>
                  Confirm ({selectedDates.length} days)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: "#0b4f5c" },
  scrollContent: { padding: 20, paddingTop: 60 },
  label:         { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 10 },
  dimText:       { color: "rgba(255,255,255,0.5)", marginTop: 5 },
  inputWrapper:  { marginBottom: 20 },
  input:         { backgroundColor: "#f0f0f0", borderRadius: 25, padding: 15, fontSize: 16, color: '#0b4f5c' },

  patientChip:             { padding: 10, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, marginRight: 8 },
  patientChipSelected:     { backgroundColor: "#7DD1E0" },
  patientChipText:         { color: "#fff" },
  patientChipTextSelected: { color: "#0b4f5c", fontWeight: "bold" },

  card:       { backgroundColor: "#f0f0f0", borderRadius: 25, padding: 15, marginBottom: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle:  { fontSize: 14, fontWeight: "bold", color: "#0b6f7c" },

  row:    { flexDirection: "row", justifyContent: "space-between" },
  column: { flex: 1, marginHorizontal: 5 },

  miniLabel: { fontSize: 14, color: "#0b6f7c", fontWeight: "bold", marginBottom: 5 },
  takeInputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ddd",
    borderRadius: 25,
    height: 45,
    paddingHorizontal: 10,
  },
  takeInputBoxError: {
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  timeText:  { marginLeft: 5, fontWeight: "bold", color: "#0b4f5c" },
  errorText: { color: '#e74c3c', fontSize: 12, marginTop: 4, marginLeft: 5 },

  addTakeBtn:  { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  addTakeText: { color: '#7DD1E0', marginLeft: 8, fontWeight: 'bold' },

  scheduleSelector: { flexDirection: "row", gap: 5, marginBottom: 13 },
  tab:       { flex: 1, padding: 15, borderRadius: 25, backgroundColor: "#f0f0f0", alignItems: "center" },
  tabActive: { backgroundColor: "#06333f" },
  tabText:       { color: "#666", fontWeight: 'bold' },
  tabTextActive: { color: "#fff", fontWeight: 'bold' },

  counterCenter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 },
  counterBtn:    { fontSize: 30, color: '#0b4f5c' },
  counterValue:  { fontSize: 20, fontWeight: 'bold', color: '#0b4f5c' },

  datePickerBtn: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  datePickerText: { marginLeft: 10, color: '#0b4f5c', fontWeight: 'bold', fontSize: 15 },

  submitBtn: {
    backgroundColor: "#06333f",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 20
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  pickerContainer: { backgroundColor: '#fff', padding: 20, borderRadius: 25 },
  pickerTitle:     { color: '#0b4f5c', fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  pickerInner:     { backgroundColor: '#eeeeee', borderRadius: 10, padding: 10 },
  calendarBox:     { backgroundColor: '#fff', borderRadius: 20, padding: 15 },
  doneBtn:         { backgroundColor: '#0a5f6a', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 15 },
  doneText:        { color: '#fff', fontWeight: 'bold' },
});