import { useRouter } from "expo-router";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.hello}>Hello!</Text>
        <Text style={styles.welcome}>Welcome to Remed</Text>

        
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.title}>Login</Text>

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

        <Text style={styles.forgot}>Forget Password?</Text>

        {/* Login Button */}
         <TouchableOpacity 
         style={styles.button}
         onPress={() => router.push('/(tabs)')}
        >
        <Text style={styles.buttonText}>Login</Text>
         </TouchableOpacity>
        <Text style={styles.signup}>
        Don’t have account?{" "}
        <Text 
       style={styles.signupLink}
       onPress={() => router.push('signup')}
         >
       Sign Up
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

  forgot: {
    textAlign: "right",
    color: "#0b4f5c",
    marginBottom: 20,
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

  signup: {
    textAlign: "center",
    color: "#555",
  },

  signupLink: {
    color: "#0b4f5c",
    fontWeight: "bold",
  },
});