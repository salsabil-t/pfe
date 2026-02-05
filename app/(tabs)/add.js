import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  Modal
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "../../src/services/supabase";

export default function AddMedicationScreen() {
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState("consecutive"); // or "specific"
  
  // For consecutive mode
  const [days, setDays] = useState(12);
  const [startDate, setStartDate] = useState(new Date());
  
  // For specific mode
  const [selectedDates, setSelectedDates] = useState([]);
  
  // Takes (times per day)
  const [takes, setTakes] = useState([{ time: "09:00", dose: 2 }]);
  
  // Pickers state
  const [showCalendar, setShowCalendar] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentTakeIndex, setCurrentTakeIndex] = useState(null);
  const [tempDate, setTempDate] = useState(new Date());

  // Add new take card
  const addTake = () => {
    setTakes([...takes, { time: "12:00", dose: 1 }]);
  };

  // Remove specific take card
  const removeTake = (index) => {
    if (takes.length > 1) {
      setTakes(takes.filter((_, i) => i !== index));
    }
  };

  // Update dose
  const updateDose = (index, delta) => {
    const updated = [...takes];
    updated[index].dose = Math.max(1, updated[index].dose + delta);
    setTakes(updated);
  };

  // Open time picker
  const openTimePicker = (index) => {
    const [hours, minutes] = takes[index].time.split(':');
    const date = new Date();
    date.setHours(parseInt(hours));
    date.setMinutes(parseInt(minutes));
    setTempDate(date);
    setCurrentTakeIndex(index);
    setShowTimePicker(true);
  };

  // Handle time change
  const onTimeChange = (event, selectedTime) => {
    setShowTimePicker(Platform.OS === 'ios');
    
    if (event.type === 'set' && selectedTime && currentTakeIndex !== null) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      
      const updated = [...takes];
      updated[currentTakeIndex].time = `${hours}:${minutes}`;
      setTakes(updated);
    }
  };

  // Handle start date change (for consecutive mode)
  const onStartDateChange = (event, date) => {
    setShowStartDatePicker(Platform.OS === 'ios');
    
    if (event.type === 'set' && date) {
      setStartDate(date);
    }
  };

  // Toggle specific date selection
  const toggleDate = () => {
    const dateString = tempDate.toISOString().split('T')[0];
    
    if (selectedDates.includes(dateString)) {
      setSelectedDates(selectedDates.filter(d => d !== dateString));
    } else {
      setSelectedDates([...selectedDates, dateString].sort());
    }
  };

  // Handle calendar date change (for specific mode)
  const onCalendarDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowCalendar(false);
    }
    
    if (event.type === 'set' && date) {
      setTempDate(date);
      if (Platform.OS === 'android') {
        toggleDate();
      }
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    const [year, month, day] = dateString.split('-');
    return `${day}-${month}-${year}`;
  };

  const formatDateObj = (date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Get display text for specific dates
  const getSpecificDatesDisplay = () => {
    if (selectedDates.length === 0) return "Select days";
    if (selectedDates.length === 1) return formatDate(selectedDates[0]);
    return `${selectedDates.length} days selected`;
  };

  // Save to database
  const handleAddMedication = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert("Error", "Please enter medication name");
      return;
    }

    if (scheduleType === "specific" && selectedDates.length === 0) {
      Alert.alert("Error", "Please select at least one day");
      return;
    }

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert("Error", "Not logged in");
        return;
      }

      // Prepare medication data based on schedule type
      const medicationData = {
        user_id: user.id,
        name: name.trim(),
        schedule_type: scheduleType,
        start_date: scheduleType === "consecutive" ? startDate.toISOString().split('T')[0] : null,
        num_of_days: scheduleType === "consecutive" ? days : null
      };

      // Insert medication
      const { data: medication, error: medError } = await supabase
        .from("add med table")
        .insert(medicationData)
        .select()
        .single();

      if (medError) {
        console.error(medError);
        Alert.alert("Error", "Failed to add medication");
        return;
      }

      // Insert medication takes (times per day)
      const takesToInsert = takes.map(take => ({
        medication_id: medication.id,
        user_id: user.id,
        time: take.time,
        dose: take.dose
      }));

      const { error: takeError } = await supabase
        .from("medication_takes")
        .insert(takesToInsert);

      if (takeError) {
        console.error(takeError);
        Alert.alert("Error", "Failed to add medication times");
        return;
      }

      // If specific mode, insert selected dates
      if (scheduleType === "specific") {
        const datesToInsert = selectedDates.map(date => ({
          medication_id: medication.id,
          scheduled_date: date
        }));

        const { error: datesError } = await supabase
          .from("medication_dates")
          .insert(datesToInsert);

        if (datesError) {
          console.error(datesError);
          Alert.alert("Error", "Failed to add medication dates");
          return;
        }
      }

      // Success!
      Alert.alert("Success", "Medication added successfully! 🎉");
      
      // Reset form
      setName("");
      setScheduleType("consecutive");
      setDays(12);
      setStartDate(new Date());
      setSelectedDates([]);
      setTakes([{ time: "09:00", dose: 2 }]);

    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Something went wrong");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="arrow-back-outline" size={26} color="#fff" />
        </View>

        {/* Medication name */}
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>Medication name</Text>
          <TextInput
            placeholder="Enter name"
            placeholderTextColor="#8e8e8e"
            style={styles.input}
            value={name}
            onChangeText={setName}
          />
        </View>

        {/* Take cards */}
        {takes.map((take, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Take {index + 1}</Text>
              <View style={styles.cardHeaderButtons}>
                {takes.length > 1 && (
                  <TouchableOpacity 
                    onPress={() => removeTake(index)}
                    style={styles.removeBtn}
                  >
                    <Ionicons name="trash-outline" size={24} color="#d32f2f" />
                  </TouchableOpacity>
                )}
                
                {index === takes.length - 1 && (
                  <TouchableOpacity 
                    style={styles.plusCircle} 
                    onPress={addTake}
                  >
                    <Ionicons name="add-circle-outline" size={29} color="#0b6f7c" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.row}>
              <View>
                <Text style={styles.smallLabel}>Time</Text>
                <TouchableOpacity 
                  style={styles.timeBox}
                  onPress={() => openTimePicker(index)}
                >
                  <Ionicons name="time-outline" size={18} color="#4F4F4F" />
                  <Text style={styles.timeText}>{take.time}</Text>
                </TouchableOpacity>
              </View>

              <View>
                <Text style={styles.smallLabel}>Dose</Text>
                <View style={styles.counter}>
                  <TouchableOpacity 
                    style={styles.counterBtn}
                    onPress={() => updateDose(index, -1)}
                  >
                    <Text style={styles.counterTextdose}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterValuedose}>{take.dose}</Text>
                  <TouchableOpacity 
                    style={styles.counterBtn}
                    onPress={() => updateDose(index, 1)}
                  >
                    <Text style={styles.counterTextdose}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ))}

        {/* Schedule Type Selector */}
        <View style={styles.scheduleSelector}>
          <TouchableOpacity
            style={[
              styles.scheduleBtn,
              scheduleType === "consecutive" && styles.scheduleBtnActive
            ]}
            onPress={() => setScheduleType("consecutive")}
          >
            <Text style={[
              styles.scheduleBtnText,
              scheduleType === "consecutive" && styles.scheduleBtnTextActive
            ]}>
              Consecutive Days
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.scheduleBtn,
              scheduleType === "specific" && styles.scheduleBtnActive
            ]}
            onPress={() => setScheduleType("specific")}
          >
            <Text style={[
              styles.scheduleBtnText,
              scheduleType === "specific" && styles.scheduleBtnTextActive
            ]}>
              Pick Specific Days
            </Text>
          </TouchableOpacity>
        </View>

        {/* Consecutive Mode: Number of days + Start date */}
        {scheduleType === "consecutive" && (
          <>
            <View style={styles.cardnodays}>
              <Text style={styles.cardTitle}>Number of days</Text>
              <View style={styles.counterCenter}>
                <TouchableOpacity 
                  style={styles.counterBtn}
                  onPress={() => setDays(Math.max(1, days - 1))}
                >
                  <Text style={styles.counterTextnodays}>−</Text>
                </TouchableOpacity>
                <View style={styles.nodaysbox}>
                  <Text style={styles.counterValuenodays}>{days}</Text>
                </View>
                <TouchableOpacity 
                  style={styles.counterBtn}
                  onPress={() => setDays(days + 1)}
                >
                  <Text style={styles.counterTextnodays}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.cardstartday}>
              <Text style={styles.cardTitle}>Start day</Text>
              <TouchableOpacity 
                style={styles.dateBox}
                onPress={() => setShowStartDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#0b6f7c" />
                <Text style={styles.dateText}>{formatDateObj(startDate)}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Specific Mode: Calendar picker */}
        {scheduleType === "specific" && (
          <View style={styles.cardstartday}>
            <Text style={styles.cardTitle}>Treatment days</Text>
            <TouchableOpacity 
              style={styles.dateBox}
              onPress={() => setShowCalendar(true)}
            >
              <Ionicons name="calendar-outline" size={20} color="#0b6f7c" />
              <Text style={styles.dateText}>{getSpecificDatesDisplay()}</Text>
            </TouchableOpacity>
            
            {selectedDates.length > 0 && (
              <View style={styles.selectedDatesContainer}>
                <Text style={styles.selectedDatesText}>
                  {selectedDates.map(formatDate).join(", ")}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Add button */}
        <TouchableOpacity style={styles.addBtn} onPress={handleAddMedication}>
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Time Picker Modal */}
      {showTimePicker && (
        <Modal transparent animationType="slide" visible={showTimePicker}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <DateTimePicker
                value={tempDate}
                mode="time"
                is24Hour={true}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onTimeChange}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.modalDoneBtn}
                  onPress={() => setShowTimePicker(false)}
                >
                  <Text style={styles.modalDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* Start Date Picker (Consecutive) */}
      {showStartDatePicker && (
        <Modal transparent animationType="slide" visible={showStartDatePicker}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select start date</Text>
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={onStartDateChange}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.modalDoneBtn}
                  onPress={() => setShowStartDatePicker(false)}
                >
                  <Text style={styles.modalDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* Calendar Picker (Specific) */}
      {showCalendar && (
        <Modal transparent animationType="slide" visible={showCalendar}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select treatment days</Text>
              <Text style={styles.modalSubtitle}>Tap dates to select/unselect</Text>
              
              <DateTimePicker
                value={tempDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={onCalendarDateChange}
              />
              
              {Platform.OS === 'ios' && (
                <View style={styles.modalButtonsRow}>
                  <TouchableOpacity
                    style={styles.modalSelectBtn}
                    onPress={toggleDate}
                  >
                    <Text style={styles.modalSelectText}>
                      {selectedDates.includes(tempDate.toISOString().split('T')[0])
                        ? 'Unselect'
                        : 'Select'} Date
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.modalDoneBtn}
                    onPress={() => setShowCalendar(false)}
                  >
                    <Text style={styles.modalDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b4f5c"
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 30
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20
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
    minHeight: 160,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardHeaderButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
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
  removeBtn: {
    padding: 4
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
    minHeight: 130,
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
  },
  selectedDatesContainer: {
    marginTop: 10,
    paddingHorizontal: 10
  },
  selectedDatesText: {
    fontSize: 14,
    color: "#4F4F4F",
    textAlign: "center",
    fontWeight: "600"
  },
  scheduleSelector: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  scheduleBtn: {
    flex: 1,
    backgroundColor: "#e6e6e6",
    borderRadius: 25,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent"
  },
  scheduleBtnActive: {
    backgroundColor: "#0b6f7c",
    borderColor: "#0a5f6a"
  },
  scheduleBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#555"
  },
  scheduleBtnTextActive: {
    color: "#fff"
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0b6f7c',
    textAlign: 'center',
    marginBottom: 5
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15
  },
  modalSelectBtn: {
    flex: 1,
    backgroundColor: '#0b6f7c',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center'
  },
  modalSelectText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  modalDoneBtn: {
    flex: 1,
    backgroundColor: '#0a5f6a',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center'
  },
  modalDoneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  }
});