import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../lib/supabase';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('Care Giver');
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [medicationStock, setMedicationStock] = useState([]);
  const [dismissedStockIds, setDismissedStockIds] = useState([]);

  // Patient modal
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editDisease, setEditDisease] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Medication edit modal
  const [showMedModal, setShowMedModal] = useState(false);
  const [editingMed, setEditingMed] = useState(null);
  const [editMedName, setEditMedName] = useState('');
  const [editMedDose, setEditMedDose] = useState('');
  const [editMedTime, setEditMedTime] = useState('09:00');
  const [editMedType, setEditMedType] = useState('consecutive');
  const [editMedDays, setEditMedDays] = useState('');
  const [showInlineTimePicker, setShowInlineTimePicker] = useState(false);
  const [showInlineCalendar, setShowInlineCalendar] = useState(false);
  const [tempTimeDate, setTempTimeDate] = useState(new Date());
  const [editSelectedDates, setEditSelectedDates] = useState([]);
  const [editMarkedDates, setEditMarkedDates] = useState({});

  // Ref so async functions always see the latest selectedPatient
  const selectedPatientRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  // Fetch patient data whenever selectedPatient changes
  useEffect(() => {
    if (selectedPatient) {
      selectedPatientRef.current = selectedPatient;
      fetchTodaySchedule(selectedPatient.id);
      fetchMedicationStock(selectedPatient.id);
      setDismissedStockIds([]);
    }
  }, [selectedPatient?.id]);

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  const loadData = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return;

      setUserName(user.user_metadata?.full_name ?? user.email.split('@')[0]);

      const { data: pts, error: ptsError } = await supabase
        .from('patients')
        .select('*')
        .eq('caregiver_id', user.id)
        .order('created_at', { ascending: true });

      if (ptsError) { console.error('Patients fetch error:', ptsError); return; }

      const list = pts ?? [];
      setPatients(list);

      if (list.length > 0) {
        const currentId = selectedPatientRef.current?.id;
        // Refresh the selected patient object from DB so fields stay in sync
        const refreshed = currentId
          ? (list.find(p => p.id === currentId) ?? list[0])
          : list[0];
        setSelectedPatient(refreshed);
      } else {
        setSelectedPatient(null);
        setTodaySchedule([]);
        setMedicationStock([]);
      }
    } catch (err) {
      console.error('loadData error:', err);
    }
  };

  const fetchTodaySchedule = async (patientId) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const { data: pmeds, error: pmedsErr } = await supabase
        .from('patient_medications')
        .select('*, medication(id, name)')
        .eq('patient_id', patientId);

      if (pmedsErr) { console.error('pmeds error:', pmedsErr); return; }
      if (!pmeds?.length) { setTodaySchedule([]); return; }

      const pmIds = pmeds.map(pm => pm.id);

      const { data: allSlots } = await supabase
        .from('schedule')
        .select('*')
        .in('patient_medication_id', pmIds);

      const { data: todayLogs } = await supabase
        .from('history')
        .select('*')
        .eq('patient_id', patientId)
        .gte('taken_at', `${todayStr}T00:00:00.000Z`)
        .lte('taken_at', `${todayStr}T23:59:59.999Z`);

      const schedule = [];

      for (const pm of pmeds) {
        let activeToday = false;

        if (pm.schedule_type === 'consecutive') {
          const start = new Date(pm.start_date + 'T00:00:00');
          const curr = new Date(todayStr + 'T00:00:00');
          const diff = Math.floor((curr - start) / 86400000);
          if (diff >= 0 && diff < parseInt(pm.num_of_days || '0')) activeToday = true;
        } else {
          const { data: spec } = await supabase
            .from('specific_medication_dates')
            .select('id')
            .eq('patient_medication_id', pm.id)
            .eq('scheduled_date', todayStr);
          if (spec?.length > 0) activeToday = true;
        }

        if (activeToday) {
          const slots = allSlots?.filter(s => s.patient_medication_id === pm.id) ?? [];
          for (const slot of slots) {
            schedule.push({
              scheduleId: slot.id,
              pmId: pm.id,
              medicationId: pm.medication?.id,
              scheduleType: pm.schedule_type,
              numOfDays: pm.num_of_days,
              startDate: pm.start_date,
              name: pm.medication?.name ?? 'Unknown',
              time: slot.time,
              dose: slot.dose,
              taken: todayLogs?.some(
                l => l.patient_medication_id === pm.id &&
                     l.scheduled_time === slot.time &&
                     l.status === 'taken'
              ) ?? false,
              pending: isTimeInFuture(slot.time),
            });
          }
        }
      }

      setTodaySchedule(schedule.sort((a, b) => a.time.localeCompare(b.time)));
    } catch (err) {
      console.error('fetchTodaySchedule error:', err);
    }
  };

  const fetchMedicationStock = async (patientId) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const { data: pmeds } = await supabase
        .from('patient_medications')
        .select('*, medication(name)')
        .eq('patient_id', patientId);

      const stockList = [];
      if (pmeds) {
        for (const pm of pmeds) {
          let remaining = 0;
          if (pm.schedule_type === 'consecutive') {
            const end = new Date(pm.start_date + 'T00:00:00');
            end.setDate(end.getDate() + (parseInt(pm.num_of_days) || 0));
            const today = new Date(todayStr + 'T00:00:00');
            const diff = Math.ceil((end - today) / 86400000);
            remaining = diff > 0 ? diff : 0;
          } else {
            const { count } = await supabase
              .from('specific_medication_dates')
              .select('*', { count: 'exact', head: true })
              .eq('patient_medication_id', pm.id)
              .gte('scheduled_date', todayStr);
            remaining = count ?? 0;
          }
          stockList.push({
            id: pm.id,
            name: pm.medication?.name ?? 'Unknown',
            daysRemaining: remaining,
          });
        }
      }
      setMedicationStock(stockList);
    } catch (err) {
      console.error('fetchMedicationStock error:', err);
    }
  };

  const isTimeInFuture = (timeStr) => {
    if (!timeStr) return false;
    const [h, m] = timeStr.split(':');
    const medTime = new Date();
    medTime.setHours(parseInt(h), parseInt(m), 0, 0);
    return medTime > new Date();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // ─── Patient CRUD ─────────────────────────────────────────────────────────────

  const savePatient = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        caregiver_id: user.id,
        name: editName.trim(),
        age: editAge ? parseInt(editAge) : null,
        disease: editDisease.trim(),
        phone_number: editPhone.trim(),
      };

      let error;
      if (editingPatient) {
        ({ error } = await supabase.from('patients').update(payload).eq('id', editingPatient.id));
      } else {
        ({ error } = await supabase.from('patients').insert(payload));
      }

      if (error) { Alert.alert('Error', error.message); return; }
      setShowPatientModal(false);
      await loadData();
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const deletePatient = (patient) => {
    Alert.alert('Delete Patient', `Delete ${patient.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('patients').delete().eq('id', patient.id);
          if (error) { Alert.alert('Error', error.message); return; }
          selectedPatientRef.current = null;
          setSelectedPatient(null);
          setTodaySchedule([]);
          setMedicationStock([]);
          await loadData();
        },
      },
    ]);
  };

  // ─── Medication Edit ──────────────────────────────────────────────────────────

  const openEditMedModal = (item) => {
    setEditingMed(item);
    setEditMedName(item.name);
    setEditMedTime(item.time ?? '09:00');
    setEditMedDose(item.dose != null ? String(item.dose) : '1');
    setEditMedType(item.scheduleType ?? 'consecutive');
    setEditMedDays(item.numOfDays != null ? String(item.numOfDays) : '');
    setEditSelectedDates([]);
    setEditMarkedDates({});
    setShowInlineTimePicker(false);
    setShowInlineCalendar(false);

    if (item.time) {
      const [h, m] = item.time.split(':');
      const d = new Date();
      d.setHours(parseInt(h), parseInt(m), 0, 0);
      setTempTimeDate(d);
    }
    setShowMedModal(true);
  };

  const onInlineTimeChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowInlineTimePicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selectedDate) {
      setTempTimeDate(selectedDate);
      const hh = selectedDate.getHours().toString().padStart(2, '0');
      const mm = selectedDate.getMinutes().toString().padStart(2, '0');
      setEditMedTime(`${hh}:${mm}`);
    }
  };

  const toggleCalendarDate = (day) => {
    const dateStr = day.dateString;
    setEditMarkedDates(prev => {
      const next = { ...prev };
      if (next[dateStr]) {
        delete next[dateStr];
      } else {
        next[dateStr] = { selected: true, selectedColor: '#0b4f5c', selectedTextColor: '#fff' };
      }
      return next;
    });
    setEditSelectedDates(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    );
  };

  const saveMedication = async () => {
    if (!editingMed) return;
    try {
      // 1. Update schedule row (time + dose)
      const { error: schedErr } = await supabase
        .from('schedule')
        .update({
          time: editMedTime,
          dose: parseFloat(editMedDose) || 1,
        })
        .eq('id', editingMed.scheduleId);

      if (schedErr) { Alert.alert('Error updating schedule', schedErr.message); return; }

      // 2. Update medication name — table is 'medication' (singular) per your schema
      if (editingMed.medicationId) {
        const { error: medErr } = await supabase
          .from('medication')
          .update({ name: editMedName.trim() })
          .eq('id', editingMed.medicationId);

        if (medErr) { Alert.alert('Error updating medication', medErr.message); return; }
      }

      // 3. Update patient_medications (schedule_type + num_of_days)
      if (editingMed.pmId) {
        const { error: pmErr } = await supabase
          .from('patient_medications')
          .update({
            schedule_type: editMedType,
            num_of_days: editMedType === 'consecutive' ? (parseInt(editMedDays) || null) : null,
          })
          .eq('id', editingMed.pmId);

        if (pmErr) { Alert.alert('Error updating patient medication', pmErr.message); return; }
      }

      // 4. Insert newly selected specific dates (if any)
      if (editMedType === 'specific' && editSelectedDates.length > 0 && editingMed.pmId) {
        const rows = editSelectedDates.map(date => ({
          patient_medication_id: editingMed.pmId,
          scheduled_date: date,
        }));
        const { error: datesErr } = await supabase.from('specific_medication_dates').insert(rows);
        if (datesErr) { Alert.alert('Error saving dates', datesErr.message); return; }
      }

      setShowMedModal(false);

      // Re-fetch data for current patient
      const pid = selectedPatientRef.current?.id;
      if (pid) {
        await fetchTodaySchedule(pid);
        await fetchMedicationStock(pid);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  // ─── Delete medication entirely from DB ──────────────────────────────────────

  const deleteMedication = (item) => {
    Alert.alert(
      'Delete Medication',
      `Remove "${item.name}" completely for this patient?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              // Delete child rows first to avoid FK constraint errors
              if (item.pmId) {
                await supabase.from('specific_medication_dates').delete().eq('patient_medication_id', item.pmId);
                await supabase.from('schedule').delete().eq('patient_medication_id', item.pmId);
                await supabase.from('history').delete().eq('patient_medication_id', item.pmId);
                await supabase.from('patient_medications').delete().eq('id', item.pmId);
              }
              const pid = selectedPatientRef.current?.id;
              if (pid) {
                await fetchTodaySchedule(pid);
                await fetchMedicationStock(pid);
              }
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  // ─── Stock dismiss (UI only, 0-days items) ────────────────────────────────────

  const dismissStockItem = (id) => setDismissedStockIds(prev => [...prev, id]);
  const visibleStock = medicationStock.filter(item => !dismissedStockIds.includes(item.id));

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.helloText}>Hello 👋</Text>
            <Text style={styles.userTitle}>{userName}</Text>
          </View>
          <View style={styles.profileIconCircle}>
            <Ionicons name="person" size={28} color="#0b4f5c" />
          </View>
        </View>

        {/* Patients chips */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Patients</Text>
            <TouchableOpacity onPress={() => {
              setEditingPatient(null);
              setEditName(''); setEditAge(''); setEditDisease(''); setEditPhone('');
              setShowPatientModal(true);
            }}>
              <Ionicons name="add-circle" size={28} color="#7DD1E0" />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.titleSpacing}>
            {patients.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.patientChip, selectedPatient?.id === p.id && styles.patientChipSelected]}
                onPress={() => setSelectedPatient(p)}
              >
                <Text style={[styles.patientChipText, selectedPatient?.id === p.id && styles.patientChipTextSelected]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Patient info card */}
        {selectedPatient && (
          <View style={styles.sectionContainer}>
            <TouchableOpacity
              style={styles.patientCard}
              onPress={() => {
                setEditingPatient(selectedPatient);
                setEditName(selectedPatient.name ?? '');
                setEditAge(selectedPatient.age != null ? String(selectedPatient.age) : '');
                setEditDisease(selectedPatient.disease ?? '');
                setEditPhone(selectedPatient.phone_number ?? '');
                setShowPatientModal(true);
              }}
            >
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Name:</Text><Text style={styles.infoValue}>{selectedPatient.name}</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Age:</Text><Text style={styles.infoValue}>{selectedPatient.age ?? 'N/A'} years old</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Disease:</Text><Text style={styles.infoValue}>{selectedPatient.disease || 'N/A'}</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Phone:</Text><Text style={styles.infoValue}>{selectedPatient.phone_number || 'N/A'}</Text></View>
              <View style={styles.cardFooter}>
                <Text style={styles.editHint}>Tap to edit</Text>
                <TouchableOpacity onPress={() => deletePatient(selectedPatient)}>
                  <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Today's schedule */}
        {selectedPatient && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.titleSpacing}>
              {todaySchedule.length === 0
                ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No meds today</Text></View>
                : todaySchedule.map(item => (
                  <View key={item.scheduleId} style={styles.scheduleCard}>
                    <View style={styles.cardIcons}>
                      <TouchableOpacity onPress={() => openEditMedModal(item)} style={styles.cardIconBtn}>
                        <Ionicons name="pencil" size={13} color="#0b4f5c" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteMedication(item)} style={styles.cardIconBtn}>
                        <Ionicons name="trash-outline" size={13} color="#e74c3c" />
                      </TouchableOpacity>
                    </View>
                    <Ionicons
                      name={item.taken ? 'checkmark-circle' : item.pending ? 'time' : 'alert-circle'}
                      size={32}
                      color={item.taken ? '#27ae60' : item.pending ? '#f39c12' : '#e74c3c'}
                    />
                    <Text style={styles.cardMedName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cardTime}>{item.time ? item.time.substring(0, 5) : '--:--'}</Text>
                    <Text style={styles.cardDose}>{item.dose} pill{item.dose !== 1 ? 's' : ''}</Text>
                  </View>
                ))
              }
            </ScrollView>
          </View>
        )}

        {/* Medication stock */}
        {selectedPatient && visibleStock.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Medication Stock</Text>
            <View style={[styles.stockMainCard, styles.titleSpacing]}>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={styles.stockScroll}
              >
                {visibleStock.map(item => (
                  <View key={item.id} style={styles.stockRow}>
                    <Text style={styles.stockNameLabel}>{item.name} :</Text>
                    <View style={styles.stockRight}>
                      <Text style={[styles.stockDaysValue, { color: item.daysRemaining === 0 ? '#e74c3c' : '#0b4f5c' }]}>
                        {item.daysRemaining} days remaining
                      </Text>
                      {item.daysRemaining === 0 && (
                        <TouchableOpacity onPress={() => dismissStockItem(item.id)} style={styles.dismissBtn}>
                          <Ionicons name="close-circle" size={18} color="#e74c3c" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
              {visibleStock.length > 2 && (
                <View style={styles.scrollTrack}>
                  <View style={styles.scrollThumb} />
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Patient Modal ── */}
      <Modal visible={showPatientModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingPatient ? 'Edit Patient' : 'Add Patient'}</Text>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput style={styles.input} placeholder="Full name" value={editName} onChangeText={setEditName} />
            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput style={styles.input} placeholder="Age" keyboardType="numeric" value={editAge} onChangeText={setEditAge} />
            <Text style={styles.fieldLabel}>Disease / Condition</Text>
            <TextInput style={styles.input} placeholder="e.g. Diabetes" value={editDisease} onChangeText={setEditDisease} />
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput style={styles.input} placeholder="Phone number" keyboardType="phone-pad" value={editPhone} onChangeText={setEditPhone} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPatientModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={savePatient}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Medication Edit Modal ── */}
      <Modal visible={showMedModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Medication</Text>

              <Text style={styles.fieldLabel}>Medication Name</Text>
              <TextInput style={styles.input} value={editMedName} onChangeText={setEditMedName} placeholder="e.g. Paracetamol" />

              <Text style={styles.fieldLabel}>Pills per take</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={editMedDose}
                onChangeText={setEditMedDose}
                placeholder="e.g. 1"
              />

              {/* Time picker */}
              <Text style={styles.fieldLabel}>Time</Text>
              <TouchableOpacity
                style={[styles.pickerField, showInlineTimePicker && styles.pickerFieldActive]}
                onPress={() => {
                  setShowInlineTimePicker(v => !v);
                  setShowInlineCalendar(false);
                }}
              >
                <Text style={styles.pickerText}>{editMedTime}</Text>
                <Ionicons name="time-outline" size={20} color="#0b4f5c" />
              </TouchableOpacity>

              {showInlineTimePicker && (
                <View style={styles.inlinePickerContainer}>
                  <DateTimePicker
                    value={tempTimeDate}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    is24Hour
                    onChange={onInlineTimeChange}
                    textColor="#0b4f5c"
                    style={Platform.OS === 'ios' ? { width: '100%' } : {}}
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity style={styles.confirmPickerBtn} onPress={() => setShowInlineTimePicker(false)}>
                      <Text style={styles.confirmPickerText}>Confirm Time ✓</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Schedule type */}
              <Text style={styles.fieldLabel}>Schedule Type</Text>
              <View style={styles.typeToggle}>
                {['consecutive', 'specific'].map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeBtn, editMedType === type && styles.typeBtnActive]}
                    onPress={() => {
                      setEditMedType(type);
                      setShowInlineCalendar(false);
                      setShowInlineTimePicker(false);
                    }}
                  >
                    <Text style={[styles.typeBtnText, editMedType === type && styles.typeBtnTextActive]}>
                      {type === 'consecutive' ? 'Consecutive' : 'Specific Days'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {editMedType === 'consecutive' ? (
                <>
                  <Text style={styles.fieldLabel}>Duration (Days)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={editMedDays}
                    onChangeText={setEditMedDays}
                    placeholder="e.g. 7"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>Add Treatment Days</Text>
                  <TouchableOpacity
                    style={[styles.pickerField, showInlineCalendar && styles.pickerFieldActive]}
                    onPress={() => {
                      setShowInlineCalendar(v => !v);
                      setShowInlineTimePicker(false);
                    }}
                  >
                    <Text style={styles.pickerText}>
                      {editSelectedDates.length === 0
                        ? 'Tap to select days'
                        : `${editSelectedDates.length} day(s) selected`}
                    </Text>
                    <Ionicons name="calendar-outline" size={20} color="#0b4f5c" />
                  </TouchableOpacity>

                  {showInlineCalendar && (
                    <View style={styles.inlineCalendarContainer}>
                      <Calendar
                        onDayPress={toggleCalendarDate}
                        markedDates={editMarkedDates}
                        markingType="simple"
                        theme={{
                          todayBackgroundColor: '#e0f7fa',
                          todayTextColor: '#0b4f5c',
                          selectedDayBackgroundColor: '#0b4f5c',
                          selectedDayTextColor: '#fff',
                          arrowColor: '#0b4f5c',
                          monthTextColor: '#0b4f5c',
                          dayTextColor: '#333',
                          textDayFontWeight: '500',
                        }}
                      />
                      <TouchableOpacity style={styles.confirmPickerBtn} onPress={() => setShowInlineCalendar(false)}>
                        <Text style={styles.confirmPickerText}>
                          {editSelectedDates.length === 0 ? 'Done' : `Confirm ${editSelectedDates.length} day(s) ✓`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowMedModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={saveMedication}>
                  <Text style={styles.saveBtnText}>Update</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b4f5c' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, marginTop: 20 },
  helloText: { color: '#fff', fontSize: 16 },
  userTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  profileIconCircle: { backgroundColor: '#fff', padding: 8, borderRadius: 50 },

  sectionContainer: { paddingHorizontal: 20, marginBottom: 15 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  titleSpacing: { marginTop: 10 },

  patientChip: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10 },
  patientChipSelected: { backgroundColor: '#7DD1E0' },
  patientChipText: { color: '#fff', fontWeight: '600' },
  patientChipTextSelected: { color: '#0b4f5c' },

  patientCard: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 30, padding: 20, marginTop: 10 },
  infoRow: { flexDirection: 'row', marginBottom: 6 },
  infoLabel: { width: 70, fontWeight: 'bold', color: '#0b4f5c' },
  infoValue: { color: '#0b4f5c', fontWeight: '600', flex: 1 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  editHint: { color: '#0b4f5c', opacity: 0.4, fontSize: 12 },

  scheduleCard: { backgroundColor: '#fff', borderRadius: 25, padding: 15, paddingTop: 30, marginRight: 12, width: 120, alignItems: 'center', position: 'relative' },
  cardIcons: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4 },
  cardIconBtn: { padding: 4 },
  cardMedName: { fontSize: 13, fontWeight: 'bold', color: '#0b4f5c', marginTop: 5, textAlign: 'center' },
  cardTime: { fontSize: 12, color: '#0b4f5c', marginTop: 2 },
  cardDose: { fontSize: 11, color: '#888', marginTop: 2 },

  stockMainCard: { backgroundColor: '#ffffff', borderRadius: 40, paddingVertical: 10, paddingLeft: 20, paddingRight: 10, maxHeight: 150, flexDirection: 'row', alignItems: 'stretch' },
  stockScroll: { flex: 1, paddingRight: 8 },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  stockNameLabel: { fontWeight: 'bold', color: '#0b4f5c', fontSize: 15, flex: 1 },
  stockRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockDaysValue: { fontWeight: '700', fontSize: 14, color: '#0b4f5c' },
  dismissBtn: { marginLeft: 4 },
  scrollTrack: { width: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.12)', marginVertical: 10, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  scrollThumb: { width: 8, height: 36, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)' },

  emptyCard: { backgroundColor: 'rgba(255,255,255,0.1)', padding: 15, borderRadius: 15, width: 150, justifyContent: 'center' },
  emptyText: { color: '#fff', textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, width: '100%' },
  modalContent: { backgroundColor: '#fff', borderRadius: 25, padding: 20, width: '88%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0b4f5c', marginBottom: 15, textAlign: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: 'bold', color: '#0b4f5c', marginBottom: 5, marginLeft: 5 },
  input: { backgroundColor: '#f0f0f0', borderRadius: 12, padding: 12, marginBottom: 15, color: '#0b4f5c' },

  pickerField: { backgroundColor: '#f0f0f0', borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerFieldActive: { backgroundColor: '#dff0f3', borderWidth: 1.5, borderColor: '#7DD1E0' },
  pickerText: { color: '#0b4f5c', fontWeight: '500' },

  inlinePickerContainer: { backgroundColor: '#f8f8f8', borderRadius: 12, marginBottom: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#e0e0e0' },
  inlineCalendarContainer: { backgroundColor: '#f8f8f8', borderRadius: 12, marginBottom: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#e0e0e0' },
  confirmPickerBtn: { backgroundColor: '#0b4f5c', padding: 10, alignItems: 'center', margin: 10, borderRadius: 10 },
  confirmPickerText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  typeToggle: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 12, padding: 4, marginBottom: 15 },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  typeBtnActive: { backgroundColor: '#7DD1E0' },
  typeBtnText: { color: '#0b4f5c', fontSize: 12, fontWeight: '500' },
  typeBtnTextActive: { fontWeight: 'bold', color: '#0b4f5c' },

  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  saveBtn: { backgroundColor: '#0b4f5c', padding: 14, borderRadius: 12, width: '48%', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  cancelBtn: { backgroundColor: '#eee', padding: 14, borderRadius: 12, width: '48%', alignItems: 'center' },
  cancelBtnText: { color: '#0b4f5c', fontWeight: '600' },
});
