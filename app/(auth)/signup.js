import { Ionicons } from "@expo/vector-icons";
import { useRouter } from 'expo-router';
import { useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from '../lib/supabase';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  
const handleSignup = async () => {
  // Validation
  if (!email || !password || !confirmPassword) {
    alert("Please fill all fields");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match");
    return;
  }

  if (!phone || phone.trim() === "") {
    alert("Please enter your phone number");
    return;
  }

  // Formater le numéro
  let formattedPhone = phone.trim();
  if (formattedPhone.startsWith("0")) {
    formattedPhone = "+213" + formattedPhone.substring(1);
  }

  try {
    // ÉTAPE 1 : Créer le compte
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
    });

    if (authError) {
      alert(authError.message);
      return;
    }

    console.log(" User created:", authData.user.id);
    console.log("📞Phone to save:", formattedPhone);

    // ÉTAPE 2 : Créer le profil DIRECTEMENT avec le service_role (bypass RLS)
    // On utilise une fonction SQL pour contourner les RLS
    const { data: profileData, error: profileError } = await supabase.rpc(
      'create_profile_with_phone',
      {
        user_id: authData.user.id,
        user_email: email.trim(),
        user_phone: formattedPhone
      }
    );

    if (profileError) {
      console.error("Profile error:", profileError);
      alert("Account created but phone not saved. Error: " + profileError.message);
    } else {
      console.log(" Profile created:", profileData);
    }

    alert("Account created! You can now log in.");
    router.push("/(auth)/login");
    
  } catch (err) {
    console.error("Error:", err);
    alert("Something went wrong: " + err.message);
  }
};
  
  return (
     
    <View style={styles.container}>
       {/* Images en haut */}
            <View style={styles.topSection}>
          <Image
            source={require("../../assets/images/adn.png")}
            style={styles.adn}
          />
         </View>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.hello}>Create Account</Text>
        <Text style={styles.welcome}>Join Remed today</Text>
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.title}>Sign Up</Text>

        {/* Email */}
        <View style={styles.inputContainer}>
           <Ionicons name="mail-outline" size={20} color="#0b4f5c" /> 
          <TextInput
            placeholder="Email"
            placeholderTextColor={"#555"}
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
        </View>

        {/* Password */}
        <View style={styles.inputContainer}>
           <Ionicons name="lock-closed-outline" size={20} color="#0b4f5c" />
          <TextInput
            placeholder="Password"
            placeholderTextColor={"#555"}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
        </View>

        {/* Confirm Password */}
        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#0b4f5c" />
          <TextInput
            placeholder="Confirm Password"
            placeholderTextColor={"#555"}
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.input}
          />
        </View>

        {/* Phone */}
        <View style={styles.inputContainer}>
          <Ionicons name="call-outline" size={20} color="#0b4f5c" />
          <TextInput
            placeholder="Phone"
            placeholderTextColor={"#555"}
            value={phone}
            onChangeText={(text) => {setPhone(text)}}
            style={styles.input}
            keyboardType="phone-pad"
          />
        </View>

        {/* Sign Up Button */}
        <TouchableOpacity 
          style={styles.button}
          onPress={handleSignup}
        >
          <Text style={styles.buttonText}>Sign Up</Text>
        </TouchableOpacity>

        <Text style={styles.login}>
          Already have an account?{" "}
          <Text 
            style={styles.loginLink}
            onPress={() => router.push('/(auth)/login')}
          >
            Login
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b4f5c",
  },
  header: {
    padding: 30,
    marginTop:60
  },
  hello: {
    fontSize: 32,
    color: "white",
    fontWeight: "bold",
  },
  welcome: {
    color: "white",
    fontSize: 16,
    marginTop: 5,
  },
  card: {
    flex: 1,
    backgroundColor: "#eaeaea",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 25,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#0b4f5c",
  },
  inputContainer: {
    backgroundColor: "white",
    borderRadius: 30,
    paddingHorizontal: 20,
    marginBottom: 15,
    height: 50,
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center"
  },
  input: {
    flex: 1,
    fontSize: 16,
    marginLeft: 10,
    fontSize: 16,
    marginLeft: 10
  },
  button: {
    backgroundColor: "#0b4f5c",
    height: 50,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  login: {
    textAlign: "center",
    color: "#555",
  },
  loginLink: {
    color: "#0b4f5c",
    fontWeight: "bold",
  },
  adn: {
    position: "absolute",
    top: 0,
    left: 3,
    width: 100,
    height: 100,
    resizeMode: "contain",
  },

});