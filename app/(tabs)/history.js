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
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateRange, setDateRange]       = useState([]);
  const [medications, setMedications]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const scrollRef = useRef(null);

  // ── 1. Build date range and auto-scroll to today ──────────────────────────
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

  // ── 2. Re-fetch whenever the selected date changes ────────────────────────
  useEffect(() => {
    fetchHistoryData();
  }, [selectedDate]);

  // ── Helper: Checks if the scheduled date and time is in the future ──────────
  //   Properly combines the selected date and time to accurately check future status
  const isTimeInFuture = (timeStr, dateStr) => {
    const now = new Date();
    const [year, month, day] = dateStr.split('-');
    const [h, m] = timeStr.split(':');

    // Create a precise Date object using the local timezone for the scheduled med
    const medTime = new Date(year, month - 1, day, parseInt(h), parseInt(m), 0, 0);
    
    return medTime > now;
  };

  // ── 3. Core data-fetch ────────────────────────────────────────────────────
  // Tables used:
  //   • add med table      — which meds exist
  //   • medication takes   — what times/doses are scheduled per med
  //   • medication_dates   — specific-type schedule dates
  //   • medication_logs    — proof of actual intake (status = 'taken')
  const fetchHistoryData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { setLoading(false); return; }

      const selectedStr = selectedDate.toISOString().split('T')[0];

      // A. All meds for this user
      const { data: meds, error: medError } = await supabase
        .from("add med table")
        .select("*")
        .eq("user_id", userId);

      if (medError || !meds || meds.length === 0) {
        setMedications([]);
        setLoading(false);
        return;
      }

      const medIds = meds.map(m => m.id);

      // B. All take-time rows for these meds
      const { data: takes } = await supabase
        .from("medication takes")
        .select("*")
        .in("medication_id", medIds);

      // C. Specific-schedule dates for the selected day
      const { data: specDates } = await supabase
        .from("medication_dates")
        .select("*")
        .in("medication_id", medIds)
        .eq("scheduled_date", selectedStr);

      // D. Query medication_logs filtered to the selected day
      const { data: logs } = await supabase
        .from("medication_logs")
        .select("*")
        .in("medication_id", medIds)
        .gte("taken_at", `${selectedStr}T00:00:00.000Z`)
        .lte("taken_at", `${selectedStr}T23:59:59.999Z`);

      let dailyList = [];

      meds.forEach(med => {
        let isScheduled = false;

        if (med.schedule_type === "consecutive") {
          const start    = new Date(med.start_date + "T00:00:00");
          const current  = new Date(selectedStr + "T00:00:00");
          const diffDays = Math.floor((current - start) / (1000 * 60 * 60 * 24));
          const duration = parseInt(med.num_of_days);
          if (diffDays >= 0 && diffDays < duration) isScheduled = true;

        } else if (med.schedule_type === "specific") {
          isScheduled = specDates?.some(sd => sd.medication_id === med.id);
        }

        if (isScheduled) {
          const medTimes = takes?.filter(t => t.medication_id === med.id) || [];

          medTimes.forEach(take => {
            const isTaken = logs?.some(
              l =>
                l.medication_id  === med.id   &&
                l.scheduled_time === take.time &&
                l.status         === 'taken'
            ) ?? false;

            // ✅ FIXED: Checks properly against local date and time
            const upcoming = isTimeInFuture(take.time, selectedStr);

            dailyList.push({
              name:     med.name,
              time:     take.time,
              dose:     take.dose,
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

  // Returns the correct icon name + color for a medication entry
  //   ✅ Green  — confirmed taken (log exists)
  //   🕐 Yellow — upcoming (time hasn't passed yet)
  //   ❌ Red    — missed (time has passed, not taken)
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

      {/* Body */}
      {loading ? (
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
  header:             { flexDirection: "row", alignItems: "center", padding: 20, marginTop: 10 },
  headerTitle:        { color: "white", fontSize: 28, fontWeight: "bold", marginLeft: 15 },
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
  emptyText:          { color: "rgba(255,255,255,0.5)", fontSize: 16 },
});