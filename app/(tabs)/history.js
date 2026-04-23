import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = 72;

export default function HistoryScreen() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loadingPatients, setLoadingPatients] = useState(true);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateRange, setDateRange]       = useState([]);
  const [medications, setMedications]   = useState([]);
  const [loading, setLoading]           = useState(false);
  const scrollRef = useRef(null);

  // ── 1. Fetch Patients on Mount ──────────────────────────────────────────────
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
    } catch (error) {
      console.error("Error fetching patients:", error.message);
    } finally {
      setLoadingPatients(false);
    }
  };

  // ── 2. Build date range and auto-scroll to today ──────────────────────────
  useEffect(() => {
    const dates = [];
    const today = new Date();
    for (let i = -60; i <= 60; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    setDateRange(dates);

    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          x: (60 * ITEM_WIDTH) - (width / 2) + (ITEM_WIDTH / 2),
          animated: false,
        });
      }
    }, 150);
  }, []);

  // ── 3. Re-fetch whenever the selected date or patient changes ─────────────
  useEffect(() => {
    fetchHistoryData();
  }, [selectedDate, selectedPatient]);

  // ── Helper: Checks if the scheduled date and time is in the future ────────
  const isTimeInFuture = (timeStr, dateStr) => {
    const now = new Date();
    const [year, month, day] = dateStr.split('-');
    const [h, m] = timeStr.split(':');

    const medTime = new Date(year, month - 1, day, parseInt(h), parseInt(m), 0, 0);
    return medTime > now;
  };

  // ── 4. Core data-fetch mapped to your provided schema ─────────────────────
  const fetchHistoryData = async () => {
    if (!selectedPatient) {
      setMedications([]);
      return;
    }

    setLoading(true);
    try {
      const selectedStr = selectedDate.toISOString().split('T')[0];

      // A. Get patient's assigned medications mapped to medication table
      const { data: pMeds, error: pMedsError } = await supabase
        .from("patient_medications")
        .select(`
          id,
          schedule_type,
          start_date,
          num_of_days,
          medication ( id, name )
        `)
        .eq("patient_id", selectedPatient.id);

      if (pMedsError || !pMeds || pMeds.length === 0) {
        setMedications([]);
        setLoading(false);
        return;
      }

      const pMedIds = pMeds.map(pm => pm.id);

      // B. Get all schedule times for these medications
      const { data: schedules } = await supabase
        .from("schedule")
        .select("*")
        .in("patient_medication_id", pMedIds);

      // C. Get specific dates for the selected day
      const { data: specDates } = await supabase
        .from("specific_medication_dates")
        .select("*")
        .in("patient_medication_id", pMedIds)
        .eq("scheduled_date", selectedStr);

      // D. Get logs from "history" table filtered to the selected day
      // (Assuming 'created_at' or similar timestamp handles the day logged)
      const { data: logs } = await supabase
        .from("history")
        .select("*")
        .eq("patient_id", selectedPatient.id)
        .gte("created_at", `${selectedStr}T00:00:00.000Z`)
        .lte("created_at", `${selectedStr}T23:59:59.999Z`);

      let dailyList = [];

      pMeds.forEach(pm => {
        let isScheduled = false;

        if (pm.schedule_type === "consecutive") {
          const start    = new Date(pm.start_date + "T00:00:00");
          const current  = new Date(selectedStr + "T00:00:00");
          const diffDays = Math.floor((current - start) / (1000 * 60 * 60 * 24));
          const duration = pm.num_of_days;
          
          if (diffDays >= 0 && (duration === null || diffDays < duration)) {
            isScheduled = true;
          }
        } else if (pm.schedule_type === "specific") {
          isScheduled = specDates?.some(sd => sd.patient_medication_id === pm.id);
        }

        if (isScheduled) {
          const pmSchedules = schedules?.filter(s => s.patient_medication_id === pm.id) || [];

          pmSchedules.forEach(sched => {
            // Check if there is a record in the history table for this schedule_id today
            const isTaken = logs?.some(l => l.schedule_id === sched.id) ?? false;
            const upcoming = isTimeInFuture(sched.time, selectedStr);

            dailyList.push({
              name:     pm.medication?.name || "Unknown Med",
              time:     sched.time,
              dose:     sched.dose,
              taken:    isTaken,
              upcoming: upcoming,
            });
          });
        }
      });

      // E. Group entries by time slot
      const grouped = dailyList.reduce((acc, item) => {
        const existing = acc.find(g => g.time === item.time);
        if (existing) {
          existing.items.push(item);
        } else {
          acc.push({ time: item.time, items: [item] });
        }
        return acc;
      }, []);

      setMedications(grouped.sort((a, b) => a.time.localeCompare(b.time)));

    } catch (err) {
      console.error("Fetch History Error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatTimeDisplay = (timeStr) => {
    if (!timeStr) return "";
    const [h, m]       = timeStr.split(":");
    const hours        = parseInt(h);
    const ampm         = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${m} ${ampm}`;
  };

  const getStatusIcon = (item) => {
    if (item.taken)    return { name: "checkmark-circle", color: "#2ecc71" };
    if (item.upcoming) return { name: "time",             color: "#f39c12" };
    return               { name: "close-circle",          color: "#e74c3c" };
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity>
          <Ionicons name="arrow-back" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      {/* Patient Selection Bar */}
      <View style={styles.patientWrapper}>
        {loadingPatients ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {patients.map(p => (
              <TouchableOpacity 
                key={p.id} 
                style={[styles.patientChip, selectedPatient?.id === p.id && styles.patientChipSelected]}
                onPress={() => setSelectedPatient(p)}
              >
                <Text style={[styles.patientChipText, selectedPatient?.id === p.id && styles.patientChipTextSelected]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Horizontal date picker */}
      <View style={styles.dateBar}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
        >
          {dateRange.map((date, i) => {
            const isSelected = date.toDateString() === selectedDate.toDateString();
            const month      = date.toLocaleDateString("en-US", { month: "short" });
            const dayNum     = date.getDate();
            const dayName    = date.toLocaleDateString("en-US", { weekday: "short" });

            return (
              <TouchableOpacity
                key={i}
                onPress={() => setSelectedDate(date)}
                style={[styles.dateCard, isSelected && styles.selectedCard]}
              >
                <Text style={[styles.monthText, isSelected && styles.selectedText]}>{month}</Text>
                <Text style={[styles.dateNum,   isSelected && styles.selectedText]}>{dayNum}</Text>
                <Text style={[styles.dateDay,   isSelected && styles.selectedText]}>{dayName}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Body: Conditional Rendering based on Patient Selection */}
      {!selectedPatient ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={60} color="rgba(255,255,255,0.4)" />
          <Text style={[styles.emptyText, { marginTop: 15 }]}>Please select a patient</Text>
          <Text style={[styles.emptyText, { fontSize: 14 }]}>to view their medication history.</Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7DD1E0" />
        </View>
      ) : medications.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No medications scheduled for this day.</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {medications.map((group, index) => (
            <View key={index} style={styles.timelineRow}>

              {/* Left timeline decoration */}
              <View style={styles.leftLine}>
                <View style={styles.dot} />
                <View style={styles.line} />
              </View>

              {/* Med card */}
              <View style={styles.medCard}>
                <Text style={styles.timeLabel}>{formatTimeDisplay(group.time)}</Text>

                <View style={styles.medItemsContainer}>
                  {group.items.map((med, medIdx) => {
                    const icon = getStatusIcon(med);
                    return (
                      <View key={medIdx} style={styles.medRow}>
                        <Ionicons name={icon.name} size={20} color={icon.color} />
                        <Text style={styles.medNameText}>
                          {med.name} ({med.dose} Dose)
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: "#0b4f5c" },
  header:             { flexDirection: "row", alignItems: "center", padding: 20, marginTop: 10, paddingBottom: 10 },
  headerTitle:        { color: "white", fontSize: 28, fontWeight: "bold", marginLeft: 15 },
  
  // Patient Bar Styles
  patientWrapper:     { paddingHorizontal: 20, marginBottom: 20 },
  patientChip:        { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 25, marginRight: 10 },
  patientChipSelected:{ backgroundColor: "#7DD1E0" },
  patientChipText:    { color: "#fff", fontWeight: "600" },
  patientChipTextSelected: { color: "#0b4f5c", fontWeight: "bold" },

  center:             { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  dateBar:            { paddingLeft: 20, marginBottom: 15, height: 100 },
  dateCard:           { backgroundColor: "#D9D9D9", width: 60, height: 90, borderRadius: 15, justifyContent: "center", alignItems: "center", marginRight: 12 },
  selectedCard:       { backgroundColor: "#4D595B", borderWidth: 1, borderColor: "#7DD1E0" },
  monthText:          { fontSize: 10, fontWeight: "bold", color: "#06303A" },
  dateNum:            { fontSize: 18, fontWeight: "bold", color: "#06303A" },
  dateDay:            { fontSize: 11, color: "#06303A" },
  selectedText:       { color: "#7DD1E0" },
  content:            { flex: 1, paddingHorizontal: 20 },
  timelineRow:        { flexDirection: "row", minHeight: 100 },
  leftLine:           { alignItems: "center", marginRight: 15 },
  dot:                { width: 12, height: 12, borderRadius: 6, backgroundColor: "white", marginTop: 40 },
  line:               { width: 2, flex: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  medCard:            { flex: 1, backgroundColor: "#D9D9D9", borderRadius: 20, padding: 20, marginVertical: 10, flexDirection: "row", alignItems: "center" },
  timeLabel:          { fontSize: 16, fontWeight: "bold", color: "#06303A", width: 80 },
  medItemsContainer:  { flex: 1, borderLeftWidth: 1, borderLeftColor: "#BDC3C7", paddingLeft: 15 },
  medRow:             { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  medNameText:        { fontSize: 16, color: "#06303A", marginLeft: 8 },
  emptyText:          { color: "rgba(255,255,255,0.6)", fontSize: 16, fontWeight: "500", textAlign: "center" },
});