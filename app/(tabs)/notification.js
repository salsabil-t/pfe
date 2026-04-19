import { Ionicons } from "@expo/vector-icons";
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';

function NotificationScreen({ navigation }) {
  const [notification, setNotification] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  const router = useRouter();
  const checkMissedMedications = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 8);

    // Récupère tous les médicaments programmés aujourd'hui
    const { data: allTakes } = await supabase
      .from('medication takes')
      .select('*')
      .eq('user_id', user.id);
   
    if (!allTakes || allTakes.length === 0) return;

    // Pour chaque médicament programmé
    for (const take of allTakes) {
      const scheduledTime = take.time; 
      // ✅ AJOUTE CETTE VÉRIFICATION AU DÉBUT :
    const { data: medData } = await supabase  
      .from('add med table') // Le nom de votre table principale
      .select('name')
      .eq('id', take.medication_id)
      .single();

     const medName = medData?.name || "Unknown Medication";

  // Vérifie si ce médicament était programmé AUJOURD'HUI
       const { data: scheduledToday } = await supabase
      .from('medication_dates')
      .select('*')
      .eq('medication_id', take.medication_id)
      .eq('scheduled_date', currentDate);
  
     // Si PAS programmé aujourd'hui, skip !
     if (!scheduledToday || scheduledToday.length === 0) {
     continue; // ← PASSE AU SUIVANT
     }
      
      // Calcule la différence en minutes
      const [schedHour, schedMin] = scheduledTime.split(':').map(Number);
      const [nowHour, nowMin] = currentTime.split(':').map(Number);
      
      const scheduledMinutes = schedHour * 60 + schedMin;
      const nowMinutes = nowHour * 60 + nowMin;
      
      const differenceMinutes = nowMinutes - scheduledMinutes;
      
      // Si dépassé de plus de 10 minutes
      if (differenceMinutes > 10) {
        // Vérifie si déjà pris dans medication_logs
        const { data: logs } = await supabase
          .from('medication_logs')
          .select('*')
          .eq('user_id', user.id)
          .eq('medication_id', take.medication_id)
          .eq('scheduled_time', scheduledTime)
          .gte('taken_at', `${currentDate}T00:00:00`)
          .lte('taken_at', `${currentDate}T23:59:59`);

        // Si pas pris → vérifie si notification déjà créée
        if (!logs || logs.length === 0) {
          const { data: existingNotif } = await supabase
            .from('notification')
            .select('*')
            .eq('user_id', user.id)
            .eq('medication_id', take.medication_id)
            .eq('scheduled_time', scheduledTime)
            .gte('created_at',` ${currentDate}T00:00:00`);

          // Si notification pas encore créée
          if (!existingNotif || existingNotif.length === 0) {
             const { data: profileData } = await supabase
              .from('profiles')
              .select('phone_number')
              .eq('id', user.id)
              .single();
              const userPhone = profileData ?.phone_number;
            // Crée notification "missed"
            await supabase.from('notification').insert({
              user_id: user.id,
              medication_id: take.medication_id,
              scheduled_time: scheduledTime,
              type: 'missed',
              message: `The medication "${medName}" scheduled at ${scheduledTime.slice(0, 5)} was not taken`,
              show_call_button: true,
              phone_number: userPhone,
              is_read: false,
              created_at: now.toISOString(),
            });
    
            // Marque aussi dans medication_logs comme "missed"
            await supabase.from('medication_logs').insert({
              user_id: user.id,
              medication_id: take.medication_id,
              scheduled_time: scheduledTime,
              status: 'missed',
              taken_at: null,
            });

            console.log(`Notification created : medication not taken at ${scheduledTime}`);
          }
        }
      }
    }
  } catch (error) {
    console.error("Erreur checkMissedMedications:", error);
  }
};

  useEffect(() => {
  fetchNotification();
  checkMissedMedications(); 
  const checkInterval = setInterval(checkMissedMedications, 30 * 1000);

  // Canal 1 : Écoute les changements dans la table 'notification' (votre code actuel)
  const notificationSubscription = supabase
    .channel('notification-channel')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notification',
      },
      (payload) => {
        console.log('Notification changée:', payload);
        fetchNotification();
      }
    )
    .subscribe();

  
  return () => {
    clearInterval(checkInterval);
    notificationSubscription.unsubscribe();
    
  };
}, []);

 const fetchNotification = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('notification')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    setNotification(data || []);
  } catch (error) {
    console.error('Erreur:', error);
  }
};

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotification();
    setRefreshing(false);
  };

  const markAsRead = async (id) => {
    try {
      const { error } = await supabase
        .from('notification')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;
      await fetchNotification();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };
  
  const deleteNotification = async (id) => {
    Alert.alert(
      '🗑️ Delete Notification',
      'Are you sure you want to delete this notification ?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('notification')
                .delete()
                .eq('id', id);

              if (error) throw error;
              await fetchNotification();
            } catch (error) {
              console.error('Erreur:', error);
            }
          },
        },
      ]
    );
  };

  const makeCall = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert('Erreur', '📞 Phone number not found');
      return;
    }

    const url = `tel:${phoneNumber}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Erreur', 'Unable to open the phone dialer');
        }
      })
      .catch((err) => console.error('Call error:', err));
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
    return `${hours}:${minutes} ${ampm}`;
    };

  const isToday = (timestamp) => {
    const today = new Date();
    const date = new Date(timestamp);
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const todayNotification = notification.filter((notif) => isToday(notif.created_at));
  const oldNotification = notification.filter((notif) => !isToday(notif.created_at));

  const displayedNotification = activeTab === 'today' ? todayNotification : oldNotification;
  const renderNotification = ({ item }) => (
    <TouchableOpacity
      style={[styles.notificationCard, !item.is_read && styles.unreadCard]}
      onPress={() => !item.is_read && markAsRead(item.id)}
      onLongPress={() => deleteNotification(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        {/* Icône */}
        <View style={styles.iconContainer}>
          <Icon name="medical-outline" size={24} color="#FFFFFF" />
        </View>

        {/* Contenu */}
        <View style={styles.textContainer}>
          <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          <Text style={styles.messageText}>{item.message}</Text>
        </View>

        
        {/* ✅ BOUTON CALL : N'apparaît que si show_call_button est à true */}
        {item.show_call_button && (
          <TouchableOpacity
            style={styles.callButton}
            onPress={() => makeCall(item.phone_number)}
          >
            <Text style={styles.callButtonText}>call</Text>
          </TouchableOpacity>
        )}

        {/* Indicateur non lu */}
        {!item.is_read && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B5563" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.goBack()}
        >
          <Ionicons name="arrow-back-outline" size={26} color="#fff" />
        </TouchableOpacity>

        <View style={styles.placeholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'today' && styles.activeTab]}
          onPress={() => setActiveTab('today')}
        >
          <Text style={[styles.tabText, activeTab === 'today' && styles.activeTabText]}>
            Today
          </Text>
          {todayNotification.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{todayNotification.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'old' && styles.activeTab]}
          onPress={() => setActiveTab('old')}
        >
          <Text style={[styles.tabText, activeTab === 'old' && styles.activeTabText]}>
            Old
          </Text>
          {oldNotification.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{oldNotification.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Liste des notifications */}
      <FlatList
        data={displayedNotification}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#FFFFFF"
          colors={['#14B8A6']} />}
        ListEmptyComponent={<View style={styles.emptyState}>
          <Icon name="notifications-off-outline" size={80} color="rgba(255, 255, 255, 0.3)" />
          <Text style={styles.emptyText}>
            {activeTab === 'today' ? 'No notification today' : 'No old notification'}
          </Text>
        </View>} 
        />
        
    </View>
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b4f5c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#0b4f5c',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  placeholder: {
    width: 40,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#0b4f5c',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeTab: {
    backgroundColor: '#06333f',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  notificationCard: {
    backgroundColor: '#E8F4F3',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  unreadCard: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderLeftColor: '#0b4f5c',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#06333f',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  timeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0B5563',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  callButton: {
    backgroundColor: '#06333f',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 25,
    marginLeft: 8,
    minWidth: 80,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  unreadDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 16,
    textAlign: 'center',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingBottom: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  navButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NotificationScreen;