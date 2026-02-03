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

export default function SignUpScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  

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

        {/* Username */}
        <View style={styles.inputContainer}>
           <Ionicons name="person-outline" size={20} color="#0b4f5c" /> 
          <TextInput
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            style={styles.input}
          />
        </View>

        {/* Password */}
        <View style={styles.inputContainer}>
           <Ionicons name="lock-closed-outline" size={20} color="#0b4f5c" />
          <TextInput
            placeholder="Password"
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
            value={phone}
            onChangeText={setPhone}
            style={styles.input}
            keyboardType="phone-pad"
          />
        </View>

        {/* Sign Up Button */}
        <TouchableOpacity 
          style={styles.button}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.buttonText}>Sign Up</Text>
        </TouchableOpacity>

        <Text style={styles.login}>
          Already have an account?{" "}
          <Text 
            style={styles.loginLink}
            onPress={() => router.push('/login')}
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
    left: 0,
    width: 130,
    height: 130,
    resizeMode: "contain",
  },

});