import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function ConfirmationScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false); // État pour afficher le loading
  const [patients, setPatients] = useState([]); // Liste de tous les patients
  const [selectedId, setSelectedId] = useState(null); // ID du patient choisi
  const [selectedName, setSelectedName] = useState(""); // Nom du patient choisi
  const [currentMeds, setCurrentMeds] = useState([]); // Médicaments du moment
  const [selectedMeds, setSelectedMeds] = useState([]); // IDs cochés
  const [isMultiMode, setIsMultiMode] = useState(false); // Switch entre bouton unique ou liste
  
  // 1. VÉRIFICATION AU CHARGEMENT DE LA PAGE
  useEffect(() => {
    checkSession();
  }, []);
    useEffect(() => {
    if (selectedId) {
      fetchMedsForToday();
    }
  }, [selectedId]);


  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    // Si pas de session = pas connecté → redirige vers login
    if (!session) {
      Alert.alert("Error", "You are not logged in");
      router.replace('/(auth)/login');
    }
      const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('caregiver_id', session.user.id)
      .order ('created_at', {ascending:true});

    if (!error && data) {
      setPatients(data);
  }
};
 useFocusEffect(
    useCallback(() => {
      checkSession();
    }, [selectedId])
  )
  // --- NOUVELLE FONCTION : DÉTECTION DES MÉDICAMENTS ---
  const fetchMedsForToday = async () => {
  if (!selectedId) return;
  
  setLoading(true);
  try {
    // 1. Définir le début de la journée actuelle (00:00:00)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 2. Récupérer les médicaments déjà pris par ce patient aujourd'hui
    const { data: takenMeds, error: historyError } = await supabase
      .from('history')
      .select('schedule_id')
      .eq('patient_id', selectedId)
      .eq('status', 'taken')
      .gte('taken_at', startOfDay);

    if (historyError) throw historyError;

    // On crée une liste simple des IDs déjà pris
    const takenIds = takenMeds?.map(t => t.schedule_id) || [];

    // 3. Récupérer tout le programme (schedule) du patient
    const { data: allTakes, error: takeError } = await supabase
      .from('schedule')
      .select('*, patient_medications!inner(patient_id,medication_id,medication(name))')
      .eq('patient_medications.patient_id', selectedId);

    if (takeError) throw takeError;

    const nowMin = now.getHours() * 60 + now.getMinutes();

    // 4. FILTRAGE FINAL
    const medsFound = allTakes.filter(take => {
      const [h, m] = take.time.split(':').map(Number);
      const takeMin = h * 60 + m;
      
      // Condition A : Est-ce que c'est l'heure ? (+/- 60 min)
      const isCorrectTime = Math.abs(nowMin - takeMin) <= 60;
      
      // Condition B : Est-ce qu'il n'a PAS ENCORE été pris ?
      const isNotTakenYet = !takenIds.includes(take.id);
      
      return isCorrectTime && isNotTakenYet;
    });

    setCurrentMeds(medsFound);
    setIsMultiMode(medsFound.length > 1);
    
  } catch (error) {
    console.error("Fetch Meds Error:", error);
  } finally {
    setLoading(false);
  }
};

  // --- FONCTION DE CONFIRMATION ---
  const handleConfirm = async (singleMed = null) => {
    // Si singleMed existe (bouton unique), on le prend. Sinon on prend les cochés.
    const medsToProcess = singleMed ? [singleMed] : currentMeds.filter(m => selectedMeds.includes(m.id));

    if (medsToProcess.length === 0) {
      Alert.alert("Selection", "Please select at least one medication.");
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(now - offset)).toISOString();

      for (const med of medsToProcess) {
        // 1. Insertion Historique
        const { error: logError } = await supabase.from('history').insert({
          patient_id: selectedId,
          patient_medication_id: med.patient_medication_id,
          schedule_id: med.id,
          status: 'taken',
          taken_at: localISOTime,
          scheduled_time: med.time,
        });
        if (logError) throw logError;

        // 2. Insertion Notification
        await supabase.from('notification').insert({
          caregiver_id: session.user.id,
          patient_id: selectedId,
          patient_medication_id: med.patient_medication_id,
          scheduled_time: med.time,
          type: 'taken',
          message: `${selectedName} took ${med.patient_medications?.medication?.name || 'medication'} scheduled at ${med.time.slice(0, 5)}`,
          is_read: false,
          created_at: localISOTime,
        });
      }

      Alert.alert("Success", "✅ Medication confirmed!");
      router.push('/(tabs)/home');
    } catch (error) {
      Alert.alert("Error", "Failed to save.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    } catch (error) {
      Alert.alert("Error", "Could not log out");
    }
  };
  return (
  <View style={styles.container}>
    {/* Section Patients */}
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>Patients</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.titleSpacing}>
        {patients.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.patientChip, selectedId === p.id && styles.patientChipSelected]}
            onPress={() => {
              setSelectedId(p.id);
              setSelectedName(p.name);
            }}
          >
            <Text style={[styles.patientChipText, selectedId === p.id && styles.patientChipTextSelected]}>
              {p.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>

    <ScrollView contentContainerStyle={styles.mainContent}>
      {!selectedId ? (
         <>
        <View style={styles.iconContainer}>
            <Ionicons name="medical" size={120} color="#fff" />
          </View>
          <Text style={styles.title}>Please select a patient</Text>
         </>
      ) : currentMeds.length === 0 ? (
        <>
        <View style={styles.iconContainer}>
            <Ionicons name="medical" size={120} color="#fff" />
        </View>   
        <Text style={styles.title}>No medication scheduled for this time.</Text>
        </>
      ) : isMultiMode ? (
         
        // --- DESIGN : LISTE MULTIPLE (Si > 1 médicament) ---
        <View style={styles.multiContainer}>
        <View style={styles.iconContainer}>
            <Ionicons name="medical" size={30} color="#fff" />
          </View>
          <Text style={styles.title}>Select medications taken:</Text>
          {currentMeds.map((med) => (
            <TouchableOpacity
              key={med.id}
              style={[styles.medCard, selectedMeds.includes(med.id) && styles.medCardSelected]}
              onPress={() => {
                setSelectedMeds(prev =>
                  prev.includes(med.id) ? prev.filter(id => id !== med.id) : [...prev, med.id]
                );
              }}
            >
              <Ionicons
                name={selectedMeds.includes(med.id) ? "checkbox" : "square-outline"}
                size={30}
                color={selectedMeds.includes(med.id) ? "#4CAF50" : "#fff"}
              />
              <Text style={styles.medNameInList}>
                {med.patient_medications?.medication?.name} ({med.time.slice(0, 5)})
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.confirmButton}
            onPress={() => handleConfirm()} // Mode liste
            disabled={loading}
          >
             {loading ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={60} color="#fff" />
                <Text style={styles.confirmText}> CONFIRM</Text>
              </>
            )}
           
          </TouchableOpacity>
        </View>
      ) : (
        // --- DESIGN ACTUEL : UNIQUE (Si exactement 1 médicament) ---
        <>
          <View style={styles.iconContainer}>
            <Ionicons name="medical" size={120} color="#fff" />
          </View>
          <Text style={styles.title}>
            Did you take your {currentMeds[0]?.patient_medications?.medication?.name}?
          </Text>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={() => handleConfirm(currentMeds[0])} // Mode unique
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={60} color="#fff" />
                <Text style={styles.confirmText}>YES</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>

    {/* Bouton de déconnexion */}
    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
      <Ionicons name="log-out-outline" size={20} color="#fff" />
      <Text style={styles.logoutText}>Logout</Text>
    </TouchableOpacity>
  </View>
);
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b4f5c',
    padding: 25
  },
  iconContainer: {
    marginBottom: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',  // Fond légèrement transparent
    borderRadius: 100,
    padding: 30,
  },
  title: {
    fontSize: 32,
    color: '#fff',
    marginBottom: 60,
    textAlign: 'center',
    fontWeight: 'bold',
    lineHeight: 40,
  },
  confirmButton: {
    backgroundColor: '#4CAF50',  // Vert
    paddingVertical: 30,
    paddingHorizontal: 60,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    shadowColor: '#000',         // Ombre pour effet 3D
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    minWidth: 250,
    minHeight: 140,
  },
  confirmText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 10,
  },
  listContainer: { 
    height: 100, 
    marginTop: 20, 
    width: 100,
  },
  sectionContainer: { 
    paddingHorizontal: 5, 
    marginBottom: 30,
    marginTop: 20,
    width: '100%'
  },
  sectionTitle: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  titleSpacing: { 
    marginTop: 10 
  },
  patientChip: { 
    backgroundColor: 'rgba(255,255,255,0.2)', 
    borderRadius: 20, 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    marginRight: 10 
    
  },
  patientChipSelected: { 
    backgroundColor: '#7DD1E0' 
  },
  patientChipText: { 
    color: '#fff', 
    fontWeight: '600' 
  },
  patientChipTextSelected: { 
    color: '#0b4f5c' 
  },
  mainContent: {
    justifyContent: 'center', // Centre verticalement l'icône et le bouton
    alignItems: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 40,
    padding: 10,
    opacity: 0.7,  
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 8,
  },
  multiContainer: {
    width: '100%',
    alignItems: 'center',
  },
  medCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
    padding: 20,
    borderRadius: 20,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  medCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  medNameInList: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 15,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    opacity: 0.7,
    textAlign: 'center'
  },
});
