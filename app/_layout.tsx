import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  const colorScheme = useColorScheme();
 
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:"#0b4f5c",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { display: 'none' }, // ← CETTE LIGNE !
        tabBarInactiveTintColor: "#8e8e8e"
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="notification"
        options={{
          title: 'Notification',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="bell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="plus.circle.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
