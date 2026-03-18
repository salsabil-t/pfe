import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState("Care Giver");
  const [patientData, setPatientData] = useState({ name: "Not Set", age: "", disease: "N/A" });
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [medicationStock, setMedicationStock] = useState([]);
  
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [editPatientName, setEditPatientName] = useState("");
  const [editPatientAge, setEditPatientAge] = useState("");
  const [editPatientDisease, setEditPatientDisease] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch User Name
      if (user.user_metadata?.full_name) {
        setUserName(user.user_metadata.full_name);
      } else {
        setUserName(user.email.split('@')[0]);
      }

      // 2. Fetch Patient Profile
      const { data: patient } = await supabase
        .from("patient_profile")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (patient) {
        setPatientData({
          name: patient.patient_name,
          age: patient.patient_age ? `${patient.patient_age} `: "",
          disease: patient.disease || "N/A"
        });
      }

      // 3. Fetch Today's Medications
      await fetchTodaySchedule(user.id);
      
      // 4. Fetch Stock
      await fetchMedicationStock(user.id);

    } catch (error) {
      console.error("Load Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTodaySchedule = async (userId) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get all meds
    const { data: meds } = await supabase.from("add med table").select("*").eq("user_id", userId);
    if (!meds) return;

    const schedule = [];

    for (const med of meds) {
      let activeToday = false;
      if (med.schedule_type === "consecutive") {
        const start = new Date(med.start_date + "T00:00:00");
        const curr = new Date(todayStr + "T00:00:00");
        const diff = Math.floor((curr - start) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < parseInt(med.num_of_days)) activeToday = true;
      } else {
        const { data: spec } = await supabase.from("medication_dates")
          .select("*").eq("medication_id", med.id).eq("scheduled_date", todayStr);
        if (spec && spec.length > 0) activeToday = true;
      }

      if (activeToday) {
        const { data: takes } = await supabase.from("medication takes").select("*").eq("medication_id", med.id);
        const { data: logs } = await supabase.from("medication_log").select("*").eq("medication_id", med.id).eq("scheduled_date", todayStr);

        takes?.forEach(t => {
          const isTaken = logs?.some(l => l.take_id === t.id && l.status === 'taken');
          const isFuture = isTimeInFuture(t.time);
          
          schedule.push({
            id: t.id,
            name: med.name,
            time: t.time,
            dose: t.dose,
            taken: isTaken,
            pending: isFuture
          });
        });
      }
    }
    setTodaySchedule(schedule.sort((a,b) => a.time.localeCompare(b.time)));
  };

  const fetchMedicationStock = async (userId) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: meds } = await supabase.from("add med table").select("*").eq("user_id", userId);
    
    let stockList = [];
    for (const med of meds) {
        let remaining = 0;
        if (med.schedule_type === "consecutive") {
            const end = new Date(med.start_date);
            end.setDate(end.getDate() + parseInt(med.num_of_days));
            const diff = Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24));
            remaining = diff > 0 ? diff : 0;
        } else {
            const { count } = await supabase.from("medication_dates")
              .select('*', { count: 'exact', head: true })
              .eq("medication_id", med.id).gte("scheduled_date", todayStr);
            remaining = count || 0;
        }
        stockList.push({ id: med.id, name: med.name, daysRemaining: remaining });
    }
    setMedicationStock(stockList);
  };

  const isTimeInFuture = (timeStr) => {
    const [h, m] = timeStr.split(':');
    const now = new Date();
    const medTime = new Date();
    medTime.setHours(parseInt(h), parseInt(m), 0);
    return medTime > now;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openPatientModal = () => {
    setEditPatientName(patientData.name === "Not Set" ? "" : patientData.name);
    setEditPatientAge(patientData.age);
    setEditPatientDisease(patientData.disease === "N/A" ? "" : patientData.disease);
    setShowPatientModal(true);
  };

  const savePatientProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("patient_profile").upsert({
        user_id: user.id,
        patient_name: editPatientName,
        patient_age: parseInt(editPatientAge),
        disease: editPatientDisease,
        updated_at: new Date()
    });
    if (error) Alert.alert("Error", error.message);
    else { setShowPatientModal(false); loadData(); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.helloText}>Hello 👋</Text>
            <Text style={styles.userTitle}>{userName}</Text>
          </View>
          <TouchableOpacity style={styles.profileIconCircle}>
            <Ionicons name="person" size={28} color="#0b4f5c" />
          </TouchableOpacity>
        </View>

        {/* Patient Card */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Patient</Text>
          <TouchableOpacity style={styles.patientCard} onPress={openPatientModal}>
            <View style={styles.infoRow}><Text style={styles.label}>Name:</Text><Text style={styles.value}>{patientData.name}</Text></View>
            <View style={styles.infoRow}><Text style={styles.label}>Age:</Text><Text style={styles.value}>{patientData.age ? `${patientData.age} years old` : "N/A"}</Text></View>
            <View style={styles.infoRow}><Text style={styles.label}>Disease:</Text><Text style={styles.value}>{patientData.disease}</Text></View>
          </TouchableOpacity>
        </View>
        {/* Schedule Horizontal Scroll */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          {todaySchedule.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>No medications for today</Text></View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {todaySchedule.map((item) => (
                <View key={item.id} style={styles.scheduleCard}>
                  <View style={styles.iconContainer}>
                    {item.taken ? <Ionicons name="checkmark-circle" size={32} color="#27ae60" /> :
                     item.pending ? <Ionicons name="time" size={32} color="#f39c12" /> :
                     <Ionicons name="alert-circle" size={32} color="#e74c3c" />}
                  </View>
                  <Text style={styles.cardMedName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.cardTime}>{item.time.substring(0,5)}</Text>
                  <Text style={styles.cardDose}>{item.dose} Dose</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Stock Vertical List */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Medication Stock</Text>
          {medicationStock.map((item) => (
            <View key={item.id} style={styles.stockCard}>
              <Text style={styles.stockName}>{item.name}</Text>
              <Text style={[styles.stockDays, { color: item.daysRemaining <= 3 ? '#e74c3c' : '#27ae60' }]}>
                {item.daysRemaining} days left
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Patient Modal */}
      <Modal visible={showPatientModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Patient</Text>
            <TextInput style={styles.input} placeholder="Patient Name" value={editPatientName} onChangeText={setEditPatientName} />
            <TextInput style={styles.input} placeholder="Age" keyboardType="numeric" value={editPatientAge} onChangeText={setEditPatientAge} />
            <TextInput style={styles.input} placeholder="Disease" value={editPatientDisease} onChangeText={setEditPatientDisease} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPatientModal(false)}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={savePatientProfile}><Text style={{color:'#fff'}}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b4f5c' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, marginTop: 20 },
  helloText: { color: '#fff', fontSize: 16 },
  userTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  profileIconCircle: { backgroundColor: '#fff', padding: 8, borderRadius: 50 },
  sectionContainer: { paddingLeft: 20, marginBottom: 25 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  patientCard: { backgroundColor: 'rgba(255, 255, 255, 0.9)', marginRight: 20, borderRadius: 20, padding: 18 },
  infoRow: { flexDirection: 'row', marginBottom: 6 },
  label: { width: 75, fontWeight: 'bold', color: '#06333f' },
  value: { color: '#0b4f5c', flex: 1 },
  scheduleCard: { backgroundColor: '#fff', borderRadius: 16, padding: 15, marginRight: 12, width: 130, alignItems: 'center' },
  iconContainer: { marginBottom: 8 },
  cardMedName: { fontSize: 15, fontWeight: 'bold', color: '#06333f' },
  cardTime: { fontSize: 14, color: '#06333f', fontWeight: '600' },
  cardDose: { fontSize: 12, color: '#666' },
  stockCard: { backgroundColor: 'rgba(255, 255, 255, 0.9)', marginRight: 20, borderRadius: 15, padding: 15, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' },
  stockName: { fontWeight: 'bold', color: '#06333f' },
  stockDays: { fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 25, width: '85%' },
  input: { backgroundColor: '#f0f0f0', borderRadius: 10, padding: 12, marginBottom: 10 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  saveBtn: { backgroundColor: '#0b4f5c', padding: 12, borderRadius: 10, width: '45%', alignItems: 'center' },
  cancelBtn: { backgroundColor: '#eee', padding: 12, borderRadius: 10, width: '45%', alignItems: 'center' },
  emptyCard: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 20, marginRight: 20, borderRadius: 15 },
  emptyText: { color: '#fff', textAlign: 'center' }
});