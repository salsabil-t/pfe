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
  const [userName, setUserName] = useState('Care Giver');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [medicationStock, setMedicationStock] = useState([]);

  // Modal State
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editDisease, setEditDisease] = useState('');
  const [editPhone, setEditPhone] = useState('');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {   //Whenever patient changes → recompute schedule + stock
    if (selectedPatient) {
      fetchTodaySchedule(selectedPatient.id);
      fetchMedicationStock(selectedPatient.id);
    }
  }, [selectedPatient]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserName(user.user_metadata?.full_name ?? user.email.split('@')[0]);

      const { data: pts } = await supabase
        .from('patients')
        .select('*')
        .eq('caregiver_id', user.id)
        .order('created_at', { ascending: true });

      setPatients(pts ?? []);
      if (pts?.length > 0 && !selectedPatient) setSelectedPatient(pts[0]);
    } catch (error) {
      console.error('Load Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTodaySchedule = async (patientId) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: pmeds } = await supabase.from('patient_medications').select('*, medication(name)').eq('patient_id', patientId);
    if (!pmeds?.length) { setTodaySchedule([]); return; }

    const pmIds = pmeds.map(pm => pm.id);
    const { data: allSlots } = await supabase.from('schedule').select('*').in('patient_medication_id', pmIds);
    const { data: todayLogs } = await supabase.from('history').select('*').eq('patient_id', patientId).gte('taken_at', `${todayStr}T00:00:00.000Z`).lte('taken_at', `${todayStr}T23:59:59.999Z`);

    const schedule = [];
    for (const pm of pmeds) {
      let activeToday = false;
      if (pm.schedule_type === 'consecutive') {
        const start = new Date(pm.start_date + 'T00:00:00');
        const curr = new Date(todayStr + 'T00:00:00');
        const diff = Math.floor((curr - start) / 86400000);
        if (diff >= 0 && diff < parseInt(pm.num_of_days)) activeToday = true;
      } else {
        const { data: spec } = await supabase.from('specific_medication_dates').select('id').eq('patient_medication_id', pm.id).eq('scheduled_date', todayStr);
        if (spec?.length > 0) activeToday = true;
      }

      if (activeToday) {
        const slots = allSlots?.filter(s => s.patient_medication_id === pm.id) ?? [];
        slots.forEach(slot => {
          schedule.push({
            id: slot.id,
            name: pm.medication?.name ?? 'Unknown',
            time: slot.time,
            dose: slot.dose,
            taken: todayLogs?.some(l => l.patient_medication_id === pm.id && l.scheduled_time === slot.time && l.status === 'taken'),
            pending: isTimeInFuture(slot.time),
          });
        });
      }
    }
    setTodaySchedule(schedule.sort((a, b) => a.time.localeCompare(b.time)));
  };

  const fetchMedicationStock = async (patientId) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: pmeds } = await supabase.from('patient_medications').select('*, medication(name)').eq('patient_id', patientId);
    const stockList = [];
    if (pmeds) {
      for (const pm of pmeds) {
        let remaining = 0;
        if (pm.schedule_type === 'consecutive') {
          const end = new Date(pm.start_date);
          end.setDate(end.getDate() + (parseInt(pm.num_of_days) || 0));
          const diff = Math.ceil((end - new Date(todayStr)) / 86400000);
          remaining = diff > 0 ? diff : 0;
        } else {
          const { count } = await supabase.from('specific_medication_dates').select('*', { count: 'exact', head: true }).eq('patient_medication_id', pm.id).gte('scheduled_date', todayStr);
          remaining = count ?? 0;
        }
        stockList.push({ id: pm.id, name: pm.medication?.name ?? 'Unknown', daysRemaining: remaining });
      }
    }
    setMedicationStock(stockList);
  };

  // Removes the item from the local array without updating the database
  const removeStockItemUI = (id) => {
    setMedicationStock(prev => prev.filter(item => item.id !== id));
  };

  const isTimeInFuture = (timeStr) => {
    const [h, m] = timeStr.split(':');
    const medTime = new Date();
    medTime.setHours(parseInt(h), parseInt(m), 0, 0);
    return medTime > new Date();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const savePatient = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { caregiver_id: user.id, name: editName, age: parseInt(editAge), disease: editDisease, phone_number: editPhone };
    const { error } = editingPatient ? await supabase.from('patients').update(payload).eq('id', editingPatient.id) : await supabase.from('patients').insert(payload);
    if (!error) { setShowPatientModal(false); loadData(); }
  };

  const deletePatient = (patient) => {
    Alert.alert('Delete', `Delete ${patient.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('patients').delete().eq('id', patient.id);
          setSelectedPatient(null);
          loadData();
      }}
    ]);
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
          <View style={styles.profileIconCircle}><Ionicons name="person" size={28} color="#0b4f5c" /></View>
        </View>

        {/* Patients Row */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Patients</Text>
            <TouchableOpacity onPress={() => { setEditingPatient(null); setShowPatientModal(true); }}><Ionicons name="add-circle" size={28} color="#7DD1E0" /></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.titleSpacing}>
            {patients.map(p => (
              <TouchableOpacity key={p.id} style={[styles.patientChip, selectedPatient?.id === p.id && styles.patientChipSelected]} onPress={() => setSelectedPatient(p)}>
                <Text style={[styles.patientChipText, selectedPatient?.id === p.id && styles.patientChipTextSelected]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Patient Card */}
        {selectedPatient && (
          <View style={styles.sectionContainer}>
            <TouchableOpacity style={styles.patientCard} onPress={() => { setEditingPatient(selectedPatient); setEditName(selectedPatient.name); setEditAge(selectedPatient.age?.toString()); setEditDisease(selectedPatient.disease); setEditPhone(selectedPatient.phone_number); setShowPatientModal(true); }}>
              <View style={styles.infoRow}><Text style={styles.label}>Name:</Text><Text style={styles.value}>{selectedPatient.name}</Text></View>
              <View style={styles.infoRow}><Text style={styles.label}>Age:</Text><Text style={styles.value}>{selectedPatient.age || 'N/A'} years old</Text></View>
              <View style={styles.infoRow}><Text style={styles.label}>Disease:</Text><Text style={styles.value}>{selectedPatient.disease || 'N/A'}</Text></View>
              <View style={styles.infoRow}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{selectedPatient.phone_number || 'N/A'}</Text></View>
              <View style={styles.cardFooter}>
                <Text style={styles.editHint}>Tap to edit</Text>
                <TouchableOpacity onPress={() => deletePatient(selectedPatient)}><Ionicons name="trash-outline" size={20} color="#e74c3c" /></TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Schedule */}
        {selectedPatient && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.titleSpacing}>
              {todaySchedule.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No meds today</Text></View> : 
                todaySchedule.map(item => (
                  <View key={item.id} style={styles.scheduleCard}>
                    <Ionicons name={item.taken ? "checkmark-circle" : (item.pending ? "time" : "alert-circle")} size={32} color={item.taken ? "#27ae60" : (item.pending ? "#f39c12" : "#e74c3c")} />
                    <Text style={styles.cardMedName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cardTime}>{item.time}</Text>
                  </View>
                ))
              }
            </ScrollView>
          </View>
        )}

        {/* Stock */}
        {selectedPatient && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Medication Stock</Text>
            <View style={[styles.stockMainCard, styles.titleSpacing]}>
              {medicationStock.map(item => (
                <View key={item.id} style={styles.stockRow}>
                  <Text style={styles.stockNameLabel}>{item.name}:</Text>
                  
                  {/* Container for Days Text & Trash Icon */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.stockDaysValue, { color: item.daysRemaining < 3 ? '#e74c3c' : '#555', marginRight: item.daysRemaining === 0 ? 10 : 0 }]}>
                      {item.daysRemaining} days left
                    </Text>
                    
                    {/* Render Trash Icon ONLY if days = 0 */}
                    {item.daysRemaining === 0 && (
                      <TouchableOpacity onPress={() => removeStockItemUI(item.id)}>
                        <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                      </TouchableOpacity>
                    )}
                  </View>
                  
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Modal */}
      <Modal visible={showPatientModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TextInput style={styles.input} placeholder="Name" value={editName} onChangeText={setEditName} />
            <TextInput style={styles.input} placeholder="Age" keyboardType="numeric" value={editAge} onChangeText={setEditAge} />
            <TextInput style={styles.input} placeholder="Disease" value={editDisease} onChangeText={setEditDisease} />
            <TextInput style={styles.input} placeholder="Phone" value={editPhone} onChangeText={setEditPhone} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPatientModal(false)}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={savePatient}><Text style={{ color: '#fff' }}>Save</Text></TouchableOpacity>
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
  sectionContainer: { paddingHorizontal: 20, marginBottom: 9 }, 
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  titleSpacing: { marginTop: 10 }, 
  patientChip: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10 },
  patientChipSelected: { backgroundColor: '#7DD1E0' },
  patientChipText: { color: '#fff', fontWeight: '600' },
  patientChipTextSelected: { color: '#0b4f5c' },
  patientCard: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 35, padding: 20, marginTop: 15 },
  infoRow: { flexDirection: 'row', marginBottom: 8 },
  label: { width: 80, fontWeight: 'bold', color: '#0b4f5c' },
  value: { color: '#0b4f5c', fontWeight: '600', flex: 1 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  editHint: { color: '#0b4f5c', opacity: 0.4, fontSize: 12 },
  scheduleCard: { backgroundColor: '#fff', borderRadius: 20, padding: 15, marginRight: 12, width: 110, alignItems: 'center' },
  cardMedName: { fontSize: 13, fontWeight: 'bold', color: '#0b4f5c', marginTop: 5 },
  cardTime: { fontSize: 12, color: '#0b4f5c' },
  stockMainCard: { backgroundColor: '#fff', borderRadius: 25, padding: 20 },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' },
  stockNameLabel: { fontWeight: 'bold', color: '#0b4f5c' },
  stockDaysValue: { fontWeight: '600' },
  emptyCard: { backgroundColor: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 15, width: 200 },
  emptyText: { color: '#fff', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 25, width: '85%' },
  input: { backgroundColor: '#f0f0f0', borderRadius: 10, padding: 12, marginBottom: 10 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  saveBtn: { backgroundColor: '#0b4f5c', padding: 12, borderRadius: 10, width: '45%', alignItems: 'center' },
  cancelBtn: { backgroundColor: '#eee', padding: 12, borderRadius: 10, width: '45%', alignItems: 'center' },
});