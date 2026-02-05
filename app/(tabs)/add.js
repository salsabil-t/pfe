import { Ionicons } from "@expo/vector-icons"
import {
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native"
import GradientBackground from "../../components/reused/GradientBackground"

export default function AddMedicationScreen() {
  return (
    <GradientBackground>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="arrow-back-outline" size={26} color="#fff" />
        {/*<Text style={styles.headerTitle}>Add Medication</Text>*/}
      </View>

      {/* Medication name */}
      <View style={styles.inputWrapper}>
        <Text style={styles.label}>Medication name</Text>
        <TextInput
          placeholder="Enter name"
          placeholderTextColor="#8e8e8e"
          style={styles.input}
        />
      </View>

      {/* Take 1 card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Take 1</Text>
          <TouchableOpacity style={styles.plusCircle}>
            <Ionicons name="add-circle-outline" size={29} color="#0b6f7c"  />
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          {/* Time */}
          <View>
            <Text style={styles.smallLabel}>Time</Text>
            <View style={styles.timeBox}>
              <Ionicons name="time-outline" size={18} color="#4F4F4F" />
              <Text style={styles.timeText}>09:00</Text>
            </View>
          </View>

          {/* Dose */}
          <View>
            <Text style={styles.smallLabel}>Dose</Text>
            <View style={styles.counter}>
              <TouchableOpacity style={styles.counterBtn}>
                <Text style={styles.counterTextdose}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValuedose}>2</Text>
              <TouchableOpacity style={styles.counterBtn}>
                <Text style={styles.counterTextdose}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Number of days */}
      <View style={styles.cardnodays}>
        <Text style={styles.cardTitle}>Number of days</Text>
        <View style={styles.counterCenter}>
          <TouchableOpacity style={styles.counterBtn}>
            <Text style={styles.counterTextnodays}>−</Text>
          </TouchableOpacity>
          <View style={styles.nodaysbox}>
            <Text style={styles.counterValuenodays}>12</Text>
          </View>
          <TouchableOpacity style={styles.counterBtn}>
            <Text style={styles.counterTextnodays}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Start day */}
      <View style={styles.cardstartday}>
        <Text style={styles.cardTitle}>Start day</Text>
        <View style={styles.dateBox}>
          <Ionicons name="calendar-outline" size={20} color="#0b6f7c" />
          <Text style={styles.dateText}>12-03-2025</Text>
        </View>
      </View>

      {/* Add button */}
      <TouchableOpacity style={styles.addBtn}>
        <Text style={styles.addText}>Add</Text>
      </TouchableOpacity>
    </View>
    </GradientBackground>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 50
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20
  },

  headerTitle: {
    color: "#fff",
    fontSize: 25,
    fontWeight: "600",
    marginLeft: 12
  },

  label: {
    color: "#fff",
    fontSize: 18,
    marginBottom: 8,
    fontWeight: "700",
    marginLeft: 10,
  },

  inputWrapper: {
    marginBottom: 16,

  },

  input: {
    backgroundColor: "#e6e6e6",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    fontSize: 16,
    height: 50,
  },

  card: {
    backgroundColor: "#e6e6e6",
    borderRadius: 39,
    padding: 16,
    marginBottom: 20,
    height: 160,
  },
  
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0b6f7c",
    paddingLeft: 4,
    paddingTop: 1

  },

  plusCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e6e6e6",
    justifyContent: "center",
    alignItems: "center"
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    gap: 90,
    marginTop: 12
  },

  smallLabel: {
    fontSize: 17,
    color: "#555",
    fontWeight: "700",
    marginBottom: 4
  },

  timeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#C1C1C1",
    borderRadius: 16,
    height: 40,
    paddingHorizontal: 12,
    paddingLeft: 9,
    paddingVertical: 8
  },
counter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#C1C1C1",
    borderRadius: 16,
    paddingHorizontal: 5,
    height: 40
  },
  timeText: {
    marginLeft: 5,
    fontWeight: "700",
    fontSize: 17,
    color: "#4F4F4F",
    fontFamily: "inter-bold"
  },

  counterCenter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10
  },

  counterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4
  },

  counterTextdose: {
    fontSize: 22,
    color: "#0b6f7c",
    fontWeight: "600"
  },

  counterValuedose: {
    fontSize: 18,
    fontWeight: "700",
    marginHorizontal: 6,
    color: "#4F4F4F",
    fontFamily: "inter-bold"

  },
  
    cardnodays: {
    backgroundColor: "#e6e6e6",
    borderRadius: 37,
    padding: 16,
    marginBottom: 20,
    height: 110,
  },
    counterValuenodays: {
    fontSize: 20,
    fontWeight: "700",
    marginHorizontal: 6,
    color: "#4F4F4F",
    fontFamily: "inter-bold"
  },
  nodaysbox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#C1C1C1",
    borderRadius: 15,
    paddingHorizontal: 20,
    height: 40
  },
  counterTextnodays: {
    fontSize: 29,
    color: "#0b6f7c",
    fontWeight: "600"
  },
  cardstartday: {
    backgroundColor: "#e6e6e6",
    borderRadius: 37,
    padding: 16,
    marginBottom: 20,
    height: 130,
    },
  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#C1C1C1",
    borderRadius: 20,
    paddingLeft: 22,
    marginTop: 10,
    height: 54,
    marginHorizontal: 70
    
  },

  dateText: {
    marginLeft: 8,
    fontWeight: "600",
    fontSize: 18,
    color: "#4F4F4F",
    fontFamily: "inter-bold",
    

  },

  addBtn: {
    backgroundColor: "#0a5f6a",
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10
  },

  addText: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "700"
  }
})