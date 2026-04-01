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
import { supabase } from '../lib/supabase';

function NotificationScreen() {
  const [notifications, setNotifications] = useState([]); // Renamed for clarity
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

      const { data: allTakes } = await supabase
        .from('medication takes')
        .select('*')
        .eq('user_id', user.id);

      if (!allTakes || allTakes.length === 0) return;

      for (const take of allTakes) {
        const scheduledTime = take.time; 
        if (!scheduledTime) continue;

        const [schedHour, schedMin] = scheduledTime.split(':').map(Number);
        const [nowHour, nowMin] = currentTime.split(':').map(Number);
        
        const scheduledMinutes = schedHour * 60 + schedMin;
        const nowMinutes = nowHour * 60 + nowMin;
        const differenceMinutes = nowMinutes - scheduledMinutes;
        
        // If more than 2 minutes late (as per your logic)
        if (differenceMinutes > 2) {
          const { data: logs } = await supabase
            .from('medication_logs')
            .select('*')
            .eq('user_id', user.id)
            .eq('medication_id', take.medication_id)
            .eq('scheduled_time', scheduledTime)
            .gte('taken_at', `${currentDate}T00:00:00`)
            .lte('taken_at', `${currentDate}T23:59:59`);

          if (!logs || logs.length === 0) {
            const { data: existingNotif } = await supabase
              .from('notification')
              .select('*')
              .eq('user_id', user.id)
              .eq('medication_id', take.medication_id)
              .eq('scheduled_time', scheduledTime)
              .gte('created_at', `${currentDate}T00:00:00`);

            if (!existingNotif || existingNotif.length === 0) {
              await supabase.from('notification').insert({
                user_id: user.id,
                medication_id: take.medication_id,
                scheduled_time: scheduledTime,
                type: 'missed',
                message: `Medication scheduled at ${scheduledTime.slice(0, 5)} was not taken`,
                show_call_button: true,
                is_read: false,
                created_at: now.toISOString(),
              });

              await supabase.from('medication_logs').insert({
                user_id: user.id,
                medication_id: take.medication_id,
                scheduled_time: scheduledTime,
                status: 'missed',
                taken_at: null,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("Erreur checkMissedMedications:", error);
    }
  };

  const fetchNotification = async () => {
    try {
      const { data, error } = await supabase
        .from('notification')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Erreur:', error);
      Alert.alert('Erreur', 'Impossible de charger les notifications');
    }
  };

  useEffect(() => {
    fetchNotification();
    checkMissedMedications();
    
    const checkInterval = setInterval(checkMissedMedications, 30000);
    
    const subscription = supabase
      .channel('notification-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification' }, 
      () => fetchNotification())
      .subscribe();

    return () => {
      clearInterval(checkInterval);
      subscription.unsubscribe();
    };
  }, []);

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
      fetchNotification();
    } catch (error) {
      console.error('Erreur markAsRead:', error);
    }
  };

  const deleteNotification = (id) => {
    Alert.alert('🗑️ Delete', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('notification').delete().eq('id', id);
          fetchNotification();
      }},
    ]);
  };

  const makeCall = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert('Error', 'No phone number provided');
      return;
    }
    Linking.openURL(`tel:${phoneNumber}`).catch(() => 
      Alert.alert('Error', 'Cannot open dialer')
    );
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; 
    return `${hours}:${minutes} ${ampm}`;
  };

  const isToday = (timestamp) => {
    const today = new Date();
    const date = new Date(timestamp);
    return date.toDateString() === today.toDateString();
  };

  const todayNotifs = notifications.filter((n) => isToday(n.created_at));
  const oldNotifs = notifications.filter((n) => !isToday(n.created_at));
  const displayedNotifs = activeTab === 'today' ? todayNotifs : oldNotifs;

  const renderNotification = ({ item }) => (
    <TouchableOpacity
      style={[styles.notificationCard, !item.is_read && styles.unreadCard]}
      onPress={() => !item.is_read && markAsRead(item.id)}
      onLongPress={() => deleteNotification(item.id)}
    >
      <View style={styles.cardContent}>
        <View style={styles.iconContainer}>
          <Ionicons name="medical-outline" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          <Text style={styles.messageText}>{item.message}</Text>
        </View>
        {item.show_call_button && (
          <TouchableOpacity style={styles.callButton} onPress={() => makeCall(item.phone_number)}>
            <Text style={styles.callButtonText}>call</Text>
          </TouchableOpacity>
        )}
        {!item.is_read && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B5563" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'today' && styles.activeTab]} 
          onPress={() => setActiveTab('today')}
        >
          <Text style={[styles.tabText, activeTab === 'today' && styles.activeTabText]}>Today</Text>
          {todayNotifs.length > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{todayNotifs.length}</Text></View>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'old' && styles.activeTab]} 
          onPress={() => setActiveTab('old')}
        >
          <Text style={[styles.tabText, activeTab === 'old' && styles.activeTabText]}>Old</Text>
          {oldNotifs.length > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{oldNotifs.length}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayedNotifs}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFF" />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={80} color="rgba(255, 255, 255, 0.3)" />
            <Text style={styles.emptyText}>No notifications here</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b4f5c' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  placeholder: { width: 40 },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 15 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginHorizontal: 5, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  activeTab: { backgroundColor: '#06333f' },
  tabText: { fontSize: 16, color: 'rgba(255, 255, 255, 0.7)' },
  activeTabText: { color: '#FFFFFF', fontWeight: '600' },
  badge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 6, marginLeft: 6 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  listContainer: { padding: 16 },
  notificationCard: { backgroundColor: '#E8F4F3', borderRadius: 12, padding: 16, marginBottom: 12 },
  unreadCard: { backgroundColor: '#FFFFFF', borderLeftWidth: 4, borderLeftColor: '#0b4f5c' },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  iconContainer: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#06333f', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  textContainer: { flex: 1 },
  timeText: { fontSize: 15, fontWeight: '600', color: '#0B5563' },
  messageText: { fontSize: 14, color: '#374151' },
  callButton: { backgroundColor: '#06333f', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  callButtonText: { color: '#FFFFFF', fontWeight: '600' },
  unreadDot: { position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: 'white', marginTop: 10 }
});

export default NotificationScreen;