import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function ConfirmationScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false); // État pour afficher le loading

  
  // 1. VÉRIFICATION AU CHARGEMENT DE LA PAGE
  useEffect(() => {
    checkSession(); // Vérifie que l'utilisateur est bien connecté
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    // Si pas de session = pas connecté → redirige vers login
    if (!session) {
      Alert.alert("Error", "You are not logged in");
      router.replace('/(auth)/login');
    }
};
  // 2. FONCTION PRINCIPALE - CONFIRMER LA PRISE
  
  const handleConfirm = async () => {
    setLoading(true); // Active l'indicateur de chargement
    
    try {
      // === 2.1 Vérifie que l'utilisateur est connecté ===
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert("Error", "Please log in again");
        router.replace('/(auth)/login');
        return;
      }

      // === 2.2 Récupère la date et l'heure actuelles ===
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 8); 
      const currentDate = now.toISOString().split('T')[0]; 

      // === 2.3 Cherche dans medication_dates si un médicament est prévu AUJOURD'HUI ===
      // (Cette table contient les dates où le médicament doit être pris)
      const { data: scheduledDate, error: dateError } = await supabase
        .from('medication_dates')
        .select('*')
        .eq('user_id', session.user.id)      // Pour cet utilisateur
        .eq('scheduled_date', currentDate)             // Aujourd'hui
        .maybeSingle();                      // Retourne 1 résultat ou null

      if (dateError) {
        console.error("Date error:", dateError);
      }
           // Récupère TOUS les medication_takes de l'utilisateur
       const { data: allTakes, error: takeError } = await supabase
       .from('medication takes')
       .select('*')
       .eq('user_id', session.user.id);

      if (takeError) {
       console.error("Take error:", takeError);
       Alert.alert("Error", "Could not fetch medication");
       setLoading(false);
       return;
     }

      if (!allTakes || allTakes.length === 0) {
       Alert.alert("No medication", "No medication scheduled");
       setLoading(false);
       return;
     }

     // Trouve le médicament le PLUS PROCHE de l'heure actuelle
      let scheduledTake = null;
      let minDifference = Infinity;

  for (const take of allTakes) {
  const [takeHour, takeMin] = take.time.split(':').map(Number);
  const [nowHour, nowMin] = currentTime.split(':').map(Number);
  
  const takeMinutes = takeHour * 60 + takeMin;
  const nowMinutes = nowHour * 60 + nowMin;
  
  const difference = Math.abs(nowMinutes - takeMinutes);
  
  if (difference < minDifference) {
    minDifference = difference;
    scheduledTake = take;
  }
}

if (!scheduledTake) {
  Alert.alert("No medication", "No medication scheduled");
  setLoading(false);
  return;
}

console.log("Médicament le plus proche trouvé à:", scheduledTake.time);
      // === 2.6 ENREGISTRE la confirmation dans medication_logs ===
      // C'est ici qu'on sauvegarde que le vieux a pris son médicament
      const { error: logError } = await supabase
        .from('medication_logs')
        .insert({
          user_id: session.user.id,                  // Qui a pris
          medication_id: scheduledTake.medication_id, // QUEL médicament (Paracetamol, Aspirine, etc.)
          status: 'taken',                           // Statut : pris
          taken_at: now.toISOString(),               // À QUELLE heure réelle (09:05:30)
          scheduled_time: scheduledTake.time,        // À quelle heure c'était prévu (09:00:00)
        });

      if (logError) {
        console.error("Log error:", logError);
        Alert.alert("Error", "Could not save confirmation");
        setLoading(false);
        return;
      }
      // === 2.7 Succès ! Affiche message et redirige vers Home ===
      Alert.alert("Success", "✅ Medication confirmed!");
      router.push('/(tabs)/home');
      
    } catch (error) {
      console.error("Error:", error);
      Alert.alert("Error", "Something went wrong: " + error.message);
    } finally {
      setLoading(false); // Désactive le loading dans tous les cas
    }
  };

  // ========================================
  // 3. FONCTION DE DÉCONNEXION
  // ========================================
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();      // Déconnecte l'utilisateur
      router.replace('/(auth)/login');    // Redirige vers login
    } catch (error) {
      Alert.alert("Error", "Could not log out");
    }
  };
  return (
    <View style={styles.container}>
      {/* Icône médicale en haut */}
      <View style={styles.iconContainer}>
        <Ionicons name="medical" size={120} color="#fff" />
      </View>

      {/* Question simple */}
      <Text style={styles.title}>Did you take your medication?</Text>

      {/* Gros bouton YES */}
      <TouchableOpacity 
        style={styles.confirmButton} 
        onPress={handleConfirm}    // Appelle handleConfirm quand cliqué
        disabled={loading}         // Désactive pendant le chargement
      >
        {loading ? (
          // Affiche un spinner de chargement
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          // Affiche l'icône checkmark + texte YES
          <>
            <Ionicons name="checkmark-circle" size={60} color="#fff" />
            <Text style={styles.confirmText}>YES</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Bouton de déconnexion discret en bas */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#fff" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

// ========================================
// 5. STYLES CSS (design de la page)
// ========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#0b4f5c',  // Fond bleu turquoise
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    padding: 10,
    opacity: 0.7,  
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 8,
  },
});