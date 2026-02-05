import { LinearGradient } from "expo-linear-gradient"
import { StyleSheet } from "react-native"

export default function GradientBackground({ children }) {
  return (
    <LinearGradient
      colors={["#05728B", "#05283D"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {children}
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})