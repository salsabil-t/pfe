import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0b4f5c",
        headerShown: false,
        tabBarInactiveTintColor: "#8e8e8e",
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}>
      
      {/* Confirmation */}
      <Tabs.Screen
        name="confirmation"
        options={{
          title: 'Confirm',
          tabBarIcon: ({ color }) => (
            <Ionicons name="checkmark-circle" size={30} color={color} />
        ),
        }}
      />
      
      {/* Home */}
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={30} color={color} />
          ),
        }}
      />
      
      {/* Add */}
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color }) => (
            <Ionicons name="add-circle" size={30} color={color} />
          ),
        }}
      />
      
      {/* Notification */}
      <Tabs.Screen
        name="notification"
        options={{
          title: 'Notification',
          tabBarIcon: ({ color }) => (
            <Ionicons name="notifications" size={30} color={color} />
          ),
        }}
      />
      
      {/* History */}
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => (
            <Ionicons name="time" size={30} color={color} />
          ),
        }}
      />
    </Tabs>
  );
};