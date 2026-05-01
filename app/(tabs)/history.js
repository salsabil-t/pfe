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
  const [loading, setLoading]            = useState(false);
  const scrollRef = useRef(null);

  // 1. Fetch Patients on Mount
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
      
      // Auto-select first patient if available to match Home screen behavior
      if (data && data.length > 0 && !selectedPatient) {
        setSelectedPatient(data[0]);
      }
    } catch (error) {
      console.error("Error fetching patients:", error.message);
    } finally {
      setLoadingPatients(false);
    }
  };

  // 2. Build date range and auto-scroll to today
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

  // 3. Re-fetch whenever the selected date or patient changes
  useEffect(() => {
    fetchHistoryData();
  }, [selectedDate, selectedPatient]);

  const isTimeInFuture = (timeStr, dateStr) => {
    const now = new Date();
    const [year, month, day] = dateStr.split('-');
    const [h, m] = timeStr.split(':');
    const medTime = new Date(year, month - 1, day, parseInt(h), parseInt(m), 0, 0);
    return medTime > now;
  };

  const fetchHistoryData = async () => {
    if (!selectedPatient) {
      setMedications([]);
      return;
    }

    setLoading(true);
    try {
      const selectedStr = selectedDate.toISOString().split('T')[0];

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

      const { data: schedules } = await supabase
        .from("schedule")
        .select("*")
        .in("patient_medication_id", pMedIds);

      const { data: specDates } = await supabase
        .from("specific_medication_dates")
        .select("*")
        .in("patient_medication_id", pMedIds)
        .eq("scheduled_date", selectedStr);

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
            const isTaken = logs?.some(l => 
              (l.schedule_id === sched.id || (l.patient_medication_id === pm.id && l.scheduled_time === sched.time)) && 
              (l.status === 'taken' || !l.status)
            ) ?? false;
            
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
    return             { name: "close-circle",           color: "#e74c3c" };
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      

      {/* Patient Selection Bar - Matched to Home Screen */}
      <View style={styles.patientWrapper}>
        <Text style={styles.sectionTitle}>Patients</Text>
        <View style={styles.patientListContainer}>
          {loadingPatients ? (
            <ActivityIndicator color="#7DD1E0" />
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
      </View>

      {/* Horizontal Date Picker */}
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

      {/* Main Content */}
      {!selectedPatient ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={60} color="rgba(255,255,255,0.4)" />
          <Text style={[styles.emptyText, { marginTop: 15 }]}>Please select a patient</Text>
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
              <View style={styles.leftLine}>
                <View style={styles.dot} />
                <View style={styles.line} />
              </View>

              <View style={styles.medCard}>
                <Text style={styles.timeLabel}>{formatTimeDisplay(group.time)}</Text>
                <View style={styles.medItemsContainer}>
                  {group.items.map((med, medIdx) => {
                    const icon = getStatusIcon(med);
                    return (
                      <View key={medIdx} style={styles.medRow}>
                        <Ionicons name={icon.name} size={20} color={icon.color} />
                        <Text style={styles.medNameText}>
                          {med.name} ({med.dose})
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
  container: { flex: 1, backgroundColor: "#0b4f5c" },
 // Patient Bar - Home Screen Match
  patientWrapper: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: { color: "white", fontSize: 20, fontWeight: "bold", marginBottom: 12 },
  patientListContainer: { flexDirection: 'row', alignItems: 'center', height: 45 },
  patientChip: { 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    backgroundColor: "rgba(255,255,255,0.15)", 
    borderRadius: 20, 
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  patientChipSelected: { backgroundColor: "#7DD1E0", borderColor: "#7DD1E0" },
  patientChipText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  patientChipTextSelected: { color: "#0b4f5c", fontWeight: "bold" },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  dateBar: { paddingLeft: 20, marginBottom: 15, height: 100 },
  dateCard: { backgroundColor: "#D9D9D9", width: 60, height: 90, borderRadius: 15, justifyContent: "center", alignItems: "center", marginRight: 12 },
  selectedCard: { backgroundColor: "#4D595B", borderWidth: 1, borderColor: "#7DD1E0" },
  monthText: { fontSize: 10, fontWeight: "bold", color: "#06303A" },
  dateNum: { fontSize: 18, fontWeight: "bold", color: "#06303A" },
  dateDay: { fontSize: 11, color: "#06303A" },
  selectedText: { color: "#7DD1E0" },
  content: { flex: 1, paddingHorizontal: 20 },
  timelineRow: { flexDirection: "row", minHeight: 100 },
  leftLine: { alignItems: "center", marginRight: 15 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "white", marginTop: 40 },
  line: { width: 2, flex: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  medCard: { flex: 1, backgroundColor: "#D9D9D9", borderRadius: 20, padding: 20, marginVertical: 10, flexDirection: "row", alignItems: "center" },
  timeLabel: { fontSize: 16, fontWeight: "bold", color: "#06303A", width: 85 },
  medItemsContainer: { flex: 1, borderLeftWidth: 1, borderLeftColor: "#BDC3C7", paddingLeft: 15 },
  medRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  medNameText: { fontSize: 15, color: "#06303A", marginLeft: 8, fontWeight: '500' },
  emptyText: { color: "rgba(255,255,255,0.6)", fontSize: 16, fontWeight: "500", textAlign: "center" },
});