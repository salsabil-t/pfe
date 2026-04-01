import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0b4f5c",
        tabBarInactiveTintColor: "#8e8e8e",
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
        },
      }}>
      
      {/* Confirmation (Hidden from navbar) */}
      <Tabs.Screen
        name="confirmation"
        options={{
          href: null,
          title: 'Confirmation',
        }}
      />
      
      {/* Home */}
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={28} color={color} />
          ),
        }}
      />
      
      {/* Add */}
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color }) => (
            <Ionicons name="add-circle" size={32} color={color} />
          ),
        }}
      />
      
      {/* Notification */}
      <Tabs.Screen
        name="notification"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => (
            <Ionicons name="notifications" size={28} color={color} />
          ),
        }}
      />
      
      {/* History */}
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => (
            <Ionicons name="time" size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}