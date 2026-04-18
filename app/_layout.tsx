import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // ✅ Écoute les clics sur les notifications
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification cliquée !', response);
      
      // On récupère les données cachées dans la notification
      const data :any = response.notification.request.content.data;

      // ✅ Redirige vers la page Confirmation avec l'ID en paramètre
      router.push({
        pathname: '/(tabs)/confirmation',
        params: { medId: data.medicationId } 
      });
    });

    return () => subscription.remove();
  }, []);

  // ⚠️ AJOUT DU RETURN ICI POUR FIXER L'ÉCRAN BLANC
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Par défaut, on affiche l'authentification (Login/Signup) */}
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      
      {/* Une fois connecté, on affiche les onglets */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}