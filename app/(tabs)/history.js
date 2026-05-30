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
import { supabase } from "../lib/supabase";

const { width } = Dimensions.get("window");
const ITEM_WIDTH = 72;

// Returns "YYYY-MM-DD" from a JS Date in LOCAL time (not UTC)
const toLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const localDayStartUTC = (dateStr) =>// Convert local midnight to UTC ISO string for database querying
  new Date(`${dateStr}T00:00:00`).toISOString();

const localDayEndUTC = (dateStr) =>
  new Date(`${dateStr}T23:59:59`).toISOString();

const formatTimeDisplay = (timeStr) => {// Convert "HH:MM" 24h string to "H:MM AM/PM"
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hours = parseInt(h, 10);// parseInt converts the hour string to a number for comparison
  const ampm = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 || 12;// Convert to 12-hour format, using 12 instead of 0 for midnight
  return `${display}:${m} ${ampm}`;
};

const isTimeInFuture = (timeStr, dateStr) => {// Check if time is in the future compared to now
  const now = new Date();
  const [year, month, day] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  const medTime = new Date(year, month - 1, day, h, m, 0, 0);// month - 1 because JS Date months are zero-indexed
  return medTime > now;
};

export default function HistoryScreen() {
  // ── Role & identity ──────────────────────────────────────────────────────
  const [role, setRole]             = useState(null); // 'caregiver' | 'patient'
  const [myPatientId, setMyPatientId] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);

  // ── Caregiver: patient list ──────────────────────────────────────────────
  const [patients, setPatients]               = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // ── Date strip ───────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateRange, setDateRange]       = useState([]);
  const scrollRef = useRef(null);

  // ── Schedule data ────────────────────────────────────────────────────────
  const [medications, setMedications] = useState([]);
  const [loading, setLoading]         = useState(false);

  const fetchIdRef = useRef(0);

  useEffect(() => { init(); }, []);

  // Build 46-day date strip (15 before today, today, 30 after)
  useEffect(() => {
    const dates = [];
    const today = new Date();
    for (let i = -15; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    setDateRange(dates);

    setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: 15 * ITEM_WIDTH - width / 2 + ITEM_WIDTH / 2,
        animated: false,
      });
    }, 150);
  }, []);

  // Fetch history whenever date or active patient changes
  useEffect(() => {
    if (!pageLoading) {// only fetch if we've finished initial loading and know the role
      const patId =
        role === "patient" ? myPatientId : selectedPatient?.id ?? null;
      fetchHistoryData(patId);
    }
  }, [selectedDate, selectedPatient, myPatientId, role, pageLoading]);

  const init = async () => {
    try {
      const {// Check auth and get user
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr || !user) return;

      // Check caregiver first
      const { data: cg } = await supabase
        .from("care_giver")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (cg) {
        setRole("caregiver");
        await loadPatients(user.id);
        return;
      }

      // Check patient
      const { data: pat, error: patErr } = await supabase
        .from("patients")
        .select("id, name")
        .eq("id", user.id)
        .maybeSingle();

      if (patErr) console.error("[init] patients error:", patErr.message);

      if (pat) {
        setRole("patient");
        setMyPatientId(pat.id);
      }
    } catch (err) {
      console.error("[init] unexpected error:", err);
    } finally {
      setPageLoading(false);
    }
  };

  // ── CAREGIVER: load patient list ──────────────────────────────────────────
  const loadPatients = async (userId) => {
    const { data, error } = await supabase
      .from("patients")
      .select("id, name, created_at")
      .eq("caregiver_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[loadPatients] error:", error.message);
      return;
    }

    const list = data ?? [];
    setPatients(list);
    if (list.length > 0) setSelectedPatient(list[0]);
  };
// Fetch all data and build the medication list for the selected day and patient
  const fetchHistoryData = async (patId) => {
    if (!patId) { setMedications([]); return; }// no patient, no data
    fetchIdRef.current += 1;// increment the fetch ID to represent a new fetch operation
    const myFetchId   = fetchIdRef.current;

    setLoading(true);

    try {
      const selectedStr = toLocalDateString(selectedDate);

      // convert local midnight to UTC for taken_at comparison ──
      const dayStartUTC = localDayStartUTC(selectedStr); // e.g. "2025-05-10T23:00:00.000Z" for UTC+1
      const dayEndUTC   = localDayEndUTC(selectedStr);   // e.g. "2025-05-11T22:59:59.000Z" for UTC+1

      // 1 ── Prescriptions
      const { data: prescriptions, error: rxErr } = await supabase
        .from("prescription")
        .select("id, schedule_type, start_date, num_of_days, medication(id, name)")
        .eq("patient_id", patId);

      if (rxErr) {
        console.error("[fetchHistoryData] prescription error:", rxErr.message);
        if (fetchIdRef.current === myFetchId) setMedications([]);
        return;
      }
      if (!prescriptions?.length) { 
        if (fetchIdRef.current === myFetchId) setMedications([]);
        return;
      }

      //  bail(get rid of) if a newer fetch started while we awaited 
      if (fetchIdRef.current !== myFetchId) return;

      const prescriptionIds = prescriptions.map((p) => p.id);

      // 2 ── Intake time slots
      const { data: intakeTimes, error: itErr } = await supabase
        .from("intake_time")
        .select("id, prescription_id, time, dose")
        .in("prescription_id", prescriptionIds);

      if (itErr) console.error("[fetchHistoryData] intake_time error:", itErr.message);
      if (fetchIdRef.current !== myFetchId) return; // Bug 3 check

      // 3 ── Specific dates (for 'specific' schedule type)
      const { data: specDates, error: sdErr } = await supabase
        .from("specific_medication_dates")
        .select("id, prescription_id, scheduled_date")
        .in("prescription_id", prescriptionIds)
        .eq("scheduled_date", selectedStr);

      if (sdErr) console.error("[fetchHistoryData] specific_medication_dates error:", sdErr.message);
      if (fetchIdRef.current !== myFetchId) return; // Bug 3 check

      // 4 ── History logs: taken records only, filtered to the selected local date
    // use UTC-converted timestamps for taken_at comparison so midnight-crossing confirmations are not lost.
      
      const { data: logs, error: logErr } = await supabase
        .from("history")
        .select("prescription_id, intake_time_id, scheduled_time, status, taken_at")
        .eq("patient_id", patId)
        .eq("status", "taken")                // only "taken" — missed computed in JS
        .gte("taken_at", dayStartUTC)          //  correct UTC boundary
        .lte("taken_at", dayEndUTC);           //  correct UTC boundary

      if (logErr) console.error("[fetchHistoryData] history error:", logErr.message);
      if (fetchIdRef.current !== myFetchId) return; 

      // 5 ── Build daily medication list
      const dailyList = [];

      for (const pm of prescriptions) {
        let activeToday = false;

        if (pm.schedule_type === "consecutive") {
          if (pm.start_date && pm.num_of_days) {
            const start    = new Date(`${pm.start_date}T00:00:00`);
            const curr     = new Date(`${selectedStr}T00:00:00`);
            const diffDays = Math.round((curr - start) / 86_400_000);
            activeToday    = diffDays >= 0 && diffDays < parseInt(pm.num_of_days, 10);
          }
        } else if (pm.schedule_type === "specific") {
          activeToday =
            specDates?.some((sd) => sd.prescription_id === pm.id) ?? false;
        }

        if (!activeToday) continue;// skip to next prescription if this one is not active today

        const slots =
          intakeTimes?.filter((s) => s.prescription_id === pm.id) ?? [];// find all intake time slots for this prescription

        for (const slot of slots) {
        
          const isTaken =
            logs?.some(// check if there's a "taken" log for this prescription and intake time slot
              (l) => l.status === "taken" && l.intake_time_id === slot.id
            ) ?? false;

          const upcoming = isTimeInFuture(slot.time, selectedStr);

          dailyList.push({
            name:     pm.medication?.name ?? "Unknown",
            time:     slot.time,
            dose:     slot.dose,
            taken:    isTaken,
            upcoming: !isTaken && upcoming,
          });
        }
      }

      // 6 ── Group by time slot, sort chronologically
      const grouped = dailyList.reduce((acc, item) => {
        const existing = acc.find((g) => g.time === item.time);// check if we already have an entry for this time slot
        if (existing) {
          existing.items.push(item);
        } else {
          acc.push({ time: item.time, items: [item] });
        }
        return acc;
      }, []);

      if (fetchIdRef.current !== myFetchId) return;

      setMedications(grouped.sort((a, b) => a.time.localeCompare(b.time)));
    } catch (err) {
      console.error("[fetchHistoryData] unexpected error:", err);
      if (fetchIdRef.current === myFetchId) setMedications([]);
    } finally {
      // Only clear the spinner if this is still the active fetch
      if (fetchIdRef.current === myFetchId) setLoading(false);
    }
  };

  // ── Status icon helper ────────────────────────────────────────────────────
  const getStatusIcon = (item) => {
    if (item.taken)    return { name: "checkmark-circle", color: "#2ecc71" };
    if (item.upcoming) return { name: "time",             color: "#f39c12" };
    return                    { name: "close-circle",     color: "#e74c3c" };
  };

  if (pageLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7DD1E0" />
        </View>
      </SafeAreaView>
    );
  }

  const noPatientSelected = role === "caregiver" && !selectedPatient;

  return (
    <SafeAreaView style={styles.container}>

      {/* Patient chips — caregiver only */}
      {role === "caregiver" && (
        <View style={styles.patientWrapper}>
          <Text style={styles.sectionTitle}>Patients</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {patients.map((p) => (
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
        </View>
      )}

      {/* Date strip */}
      <View style={styles.dateBar}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH}
          decelerationRate="fast"
        >
          {dateRange.map((date, i) => {
            const isSelected =
              date.toDateString() === selectedDate.toDateString();
            const isToday = date.toDateString() === new Date().toDateString();
            const month   = date.toLocaleDateString("en-US", { month: "short" });
            const dayNum  = date.getDate();
            const dayName = date.toLocaleDateString("en-US", { weekday: "short" });

            return (
              <TouchableOpacity
                key={i}
                onPress={() => setSelectedDate(date)}
                style={[
                  styles.dateCard,
                  isToday    && styles.todayCard,
                  isSelected && styles.selectedCard,
                  isToday && isSelected && styles.todaySelectedCard,
                ]}
              >
                <Text
                  style={[
                    styles.monthText,
                    isToday    && styles.todayText,
                    isSelected && styles.selectedText,
                    isToday && isSelected && styles.todaySelectedText,
                  ]}
                >
                  {month}
                </Text>
                <Text
                  style={[
                    styles.dateNum,
                    isToday    && styles.todayText,
                    isSelected && styles.selectedText,
                    isToday && isSelected && styles.todaySelectedText,
                  ]}
                >
                  {dayNum}
                </Text>
                <Text
                  style={[
                    styles.dateDay,
                    isToday    && styles.todayText,
                    isSelected && styles.selectedText,
                    isToday && isSelected && styles.todaySelectedText,
                  ]}
                >
                  {dayName}
                </Text>
                {isToday && (
                  <View
                    style={[
                      styles.todayDot,
                      isSelected && styles.todayDotSelected,
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content area */}
      {noPatientSelected ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={60} color="rgba(255,255,255,0.4)" />
          <Text style={[styles.emptyText, { marginTop: 15 }]}>
            Please select a patient
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7DD1E0" />
        </View>
      ) : medications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="calendar-outline"
            size={60}
            color="rgba(255,255,255,0.4)"
          />
          <Text style={[styles.emptyText, { marginTop: 15 }]}>
            No medications scheduled for this day.
          </Text>
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
                <Text style={styles.timeLabel}>
                  {formatTimeDisplay(group.time)}
                </Text>
                <View style={styles.medItemsContainer}>
                  {group.items.map((med, medIdx) => {
                    const icon = getStatusIcon(med);
                    return (
                      <View key={medIdx} style={styles.medRow}>
                        <Ionicons
                          name={icon.name}
                          size={20}
                          color={icon.color}
                        />
                        <Text style={styles.medNameText}>
                          {med.name}{" "}
                          <Text style={styles.doseText}>
                            ({med.dose} pill{med.dose !== 1 ? "s" : ""})
                          </Text>
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b4f5c" },

  patientWrapper: { paddingHorizontal: 20, marginBottom: 16, marginTop: 10 },
  sectionTitle:   { color: "#fff", fontSize: 20, fontWeight: "bold", marginBottom: 12 },

  patientChip:             { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  patientChipSelected:     { backgroundColor: "#7DD1E0", borderColor: "#7DD1E0" },
  patientChipText:         { color: "#fff", fontWeight: "600", fontSize: 14 },
  patientChipTextSelected: { color: "#0b4f5c", fontWeight: "bold" },

  dateBar:  { paddingLeft: 20, marginBottom: 15, height: 100 },
  dateCard: { backgroundColor: "#D9D9D9", width: 60, height: 90, borderRadius: 15, justifyContent: "center", alignItems: "center", marginRight: 12 },

  selectedCard:      { backgroundColor: "#4D595B", borderWidth: 1, borderColor: "#7DD1E0" },
  todayCard:         { backgroundColor: "#ffffff", borderWidth: 2, borderColor: "#7DD1E0" },
  todayText:         { color: "#0b4f5c" },
  todaySelectedCard: { backgroundColor: "#7DD1E0", borderWidth: 2, borderColor: "#7DD1E0" },
  todaySelectedText: { color: "#0b4f5c" },
  todayDot:          { width: 5, height: 5, borderRadius: 3, backgroundColor: "#7DD1E0", marginTop: 3 },
  todayDotSelected:  { backgroundColor: "#0b4f5c" },

  monthText:    { fontSize: 10, fontWeight: "bold", color: "#06303A" },
  dateNum:      { fontSize: 18, fontWeight: "bold", color: "#06303A" },
  dateDay:      { fontSize: 11, color: "#06303A" },
  selectedText: { color: "#7DD1E0" },

  content:           { flex: 1, paddingHorizontal: 20 },
  timelineRow:       { flexDirection: "row", minHeight: 100 },
  leftLine:          { alignItems: "center", marginRight: 15 },
  dot:               { width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff", marginTop: 40 },
  line:              { width: 2, flex: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  medCard:           { flex: 1, backgroundColor: "#D9D9D9", borderRadius: 20, padding: 20, marginVertical: 10, flexDirection: "row", alignItems: "center" },
  timeLabel:         { fontSize: 16, fontWeight: "bold", color: "#06303A", width: 85 },
  medItemsContainer: { flex: 1, borderLeftWidth: 1, borderLeftColor: "#BDC3C7", paddingLeft: 15 },
  medRow:            { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  medNameText:       { fontSize: 15, color: "#06303A", marginLeft: 8, fontWeight: "500" },
  doseText:          { fontSize: 13, color: "#555", fontWeight: "400" },

  center:    { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  emptyText: { color: "rgba(255,255,255,0.6)", fontSize: 16, fontWeight: "500", textAlign: "center" },
});