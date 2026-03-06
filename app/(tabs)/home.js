 import { AlarmClock, Bell, CheckCircle2, Clock, Home, Plus, Trash2, User } from 'lucide-react-native';
import { useState } from 'react';
import { Dimensions, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window');

export default function App() {
  // --- STATE MANAGEMENT ---
  // This allows the UI to update when you change these values
  const [userName, setUserName] = useState("Care Giver");
  
  const [patientData, setPatientData] = useState({
    name: "Sam franco",
    age: "80 years old",
    disease: "Diabet",
    status: "All medications taken"
  });

  const [schedule, setSchedule] = useState([
    { id: 1, time: "8:00 AM", med: "Paracetamol", dose: "10mm", date: "07", month: "Sep", taken: true },
    { id: 2, time: "8:40 AM", med: "Paracetamol", dose: "10mm", date: "07", month: "Sep", taken: false },
  ]);

  // --- FUNCTIONS ---

  // Function to add a new medication (Example placeholder)
  const addMedication = () => {
    const newMed = {
      id: Date.now(), // Unique ID
      time: "10:00 AM",
      med: "New Medicine",
      dose: "5mm",
      date: "08",
      month: "Sep",
      taken: false
    };
    setSchedule([...schedule, newMed]);
  };

  // Function to remove a medication
  const removeMedication = (id) => {
    setSchedule(schedule.filter(item => item.id !== id));
  };

  // Function to toggle "Taken" status
  const toggleTaken = (id) => {
    setSchedule(schedule.map(item => 
      item.id === id ? { ...item, taken: !item.taken } : item
    ));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Header Section */}
        <View style={styles.header}>
          <View>
            <Text style={styles.helloText}>Hello 👋</Text>
            {/* Tapping this could open an input in a real app */}
            <TouchableOpacity onPress={() => setUserName("New CareGiver")}>
              <Text style={styles.userTitle}>{userName}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileIconCircle}>
            <User color="#0b4f5c" size={28} />
          </View>
        </View>

        {/* Patient Card */}
        <TouchableOpacity 
          style={styles.patientCard} 
          onLongPress={() => setPatientData({...patientData, name: "Updated Name"})}
        >
          <Text style={styles.cardTitle}>Patient</Text>
          <View style={styles.infoRow}><Text style={styles.label}>Name</Text><Text style={styles.value}>{patientData.name}</Text></View>
          <View style={styles.infoRow}><Text style={styles.label}>Age</Text><Text style={styles.value}>{patientData.age}</Text></View>
          <View style={styles.infoRow}><Text style={styles.label}>Disease</Text><Text style={styles.value}>{patientData.disease}</Text></View>
          <View style={styles.infoRow}><Text style={styles.label}>Status</Text><Text style={styles.value}>{patientData.status}</Text></View>
        </TouchableOpacity>

        {/* Schedule Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            <TouchableOpacity onPress={addMedication}>
               <Plus color="#fff" size={20} />
            </TouchableOpacity>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {schedule.map((item) => (
              <View key={item.id} style={styles.scheduleCard}>
                <TouchableOpacity 
                  style={styles.deleteBtn} 
                  onPress={() => removeMedication(item.id)}
                >
                  <Trash2 color="red" size={14} />
                </TouchableOpacity>
                <View style={styles.cardHeader}>
                  <Text style={styles.timeText}>{item.time}</Text>
                  <View style={styles.dateContainer}>
                    <Text style={styles.monthText}>{item.month}</Text>
                    <Text style={styles.dateText}>{item.date}</Text>
                  </View>
                </View>
                <Text style={styles.medName}>{item.med}</Text>
                <Text style={styles.medDose}>{item.dose}</Text>
                
                <TouchableOpacity onPress={() => toggleTaken(item.id)} style={styles.statusIcon}>
                  {item.taken ? <CheckCircle2 color="#0b4f5c" size={24} /> : <AlarmClock color="#0b4f5c" size={24} />}
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Stock Section (Static for now) */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Medication Stock</Text>
          <View style={styles.stockCard}>
            <View style={styles.stockItem}>
                <Text style={styles.stockName}>Medecine1 : <Text style={styles.stockDays}>7 days remaining</Text></Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.navBar}>
        <Home color="#0b4f5c" size={24} />
        <TouchableOpacity style={styles.plusCircle} onPress={addMedication}>
          <Plus color="#fff" size={24} />
        </TouchableOpacity>
        <Bell color="#999" size={24} />
        <Clock color="#999" size={24} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b4f5c' },
  scrollContent: { paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, marginTop: 20 },
  helloText: { color: '#fff', fontSize: 16 },
  userTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  profileIconCircle: { backgroundColor: '#fff', padding: 8, borderRadius: 50 },
  patientCard: { backgroundColor: 'rgba(255, 255, 255, 0.9)', margin: 20, borderRadius: 25, padding: 20 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#0b4f5c', marginBottom: 10 },
  infoRow: { flexDirection: 'row', marginBottom: 5 },
  label: { width: 70, fontWeight: 'bold', color: '#0b4f5c' },
  value: { color: '#0b4f5c' },
  sectionContainer: { paddingLeft: 20, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 20, alignItems: 'center' },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  scheduleCard: { backgroundColor: 'rgba(255, 255, 255, 0.9)', width: 140, borderRadius: 20, padding: 15, marginRight: 15, position: 'relative' },
  deleteBtn: { position: 'absolute', top: 5, right: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { fontWeight: 'bold', color: '#0b4f5c', fontSize: 12 },
  dateContainer: { alignItems: 'center' },
  monthText: { fontSize: 8, color: '#0b4f5c' },
  dateText: { fontSize: 14, fontWeight: 'bold', color: '#0b4f5c' },
  medName: { fontWeight: 'bold', color: '#0b4f5c', marginTop: 5 },
  medDose: { fontSize: 10, color: '#666' },
  statusIcon: { alignItems: 'center', marginTop: 10 },
  stockCard: { backgroundColor: 'rgba(255, 255, 255, 0.9)', marginRight: 20, borderRadius: 20, padding: 15 },
  stockName: { fontWeight: 'bold', color: '#0b4f5c' },
  navBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  plusCircle: { backgroundColor: '#0b4f5c', padding: 10, borderRadius: 50, marginTop: -30, elevation: 5 },
});
                