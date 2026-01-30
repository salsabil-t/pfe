import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from 'expo-router';

export default function SignUpScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <View style={styles.container}>
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
          <TextInput
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            style={styles.input}
          />
        </View>

        {/* Password */}
        <View style={styles.inputContainer}>
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
  },
  input: {
    fontSize: 16,
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
});