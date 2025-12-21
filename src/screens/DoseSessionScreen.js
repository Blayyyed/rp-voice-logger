import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
// import Voice from '@react-native-voice/voice';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { v4 as uuidv4 } from 'react-native-uuid';

const Voice = {
  onSpeechResults: null,
  onSpeechError: null,
  start: async () => {},
  stop: async () => {},
  destroy: () => Promise.resolve(),
  removeAllListeners: () => {}
}
import { executeSql } from '../database';

// Helper to parse a recognised phrase into a dose entry object.
function parseDosePhrase(phrase, currentComponent) {
  // This is a very naive parser. In production you'd use a robust speech grammar or NLP.
  // Expect phrases like:
  // "Dose Rate, component 2E22-F001, contact, 5 R per hour"
  // or "Dose Rate, 5 mrem per hour" when component is set via context.
  const entry = {
    componentId: currentComponent,
    readingType: 'GA',
    value: null,
    unit: null
  };
  const lower = phrase.toLowerCase();
  // Extract component if spoken.
  const compMatch = lower.match(/component\s+([\w-]+)/);
  if (compMatch) {
    entry.componentId = compMatch[1].toUpperCase();
  }
  // Extract reading type.
  if (lower.includes('contact')) entry.readingType = 'contact';
  if (lower.includes('30')) entry.readingType = '30cm';
  // Extract numeric value and unit.
  const valueMatch = lower.match(/(\d+\.?\d*)\s*(mrem|r)\s*per\s*hour/);
  if (valueMatch) {
    entry.value = parseFloat(valueMatch[1]);
    entry.unit = valueMatch[2] === 'r' ? 'R/hr' : 'mrem/hr';
  }
  return entry;
}

export default function DoseSessionScreen({ navigation }) {
  const [sessionId, setSessionId] = useState(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastEntry, setLastEntry] = useState(null);
  const [metadata, setMetadata] = useState({
    techInitials: '',
    plantUnit: '',
    area: '',
    rwp: '',
    surveyType: '',
    instrumentIds: '',
    notes: ''
  });
  const [currentComponent, setCurrentComponent] = useState(null);
  const recordingRef = useRef(null);

  useEffect(() => {
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  async function onSpeechResults(event) {
    const text = event.value?.[0];
    setTranscript(text);
    if (!text) return;
    // Simple keyword gating: accept only if phrase starts with "dose rate".
    if (/^(dose rate|dose rates)/i.test(text.trim())) {
      // Save the current audio recording URI.
      const audioUri = recordingRef.current?.getURI();
      const entry = parseDosePhrase(text, currentComponent);
      if (!entry.componentId) {
        await speak('Please specify component id or set component first.');
        return;
      }
      if (!entry.value || !entry.unit) {
        await speak('I did not catch the value and unit. Please repeat including a numeric value and unit.');
        return;
      }
      // Save to database.
      const id = uuidv4();
      await executeSql(
        `INSERT INTO dose_points (id, session_id, component_id, timestamp, reading_type, value, unit, audio_uri, transcript, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          sessionId,
          entry.componentId,
          Date.now(),
          entry.readingType,
          entry.value,
          entry.unit,
          audioUri,
          text,
          'draft'
        ]
      );
      setCurrentComponent(entry.componentId);
      setLastEntry({ ...entry, componentId: entry.componentId });
      await speak(
        `Logged ${entry.readingType} reading ${entry.value} ${entry.unit} for component ${entry.componentId}. Say Correct to confirm or say Undo to discard.`
      );
    }
  }

  async function onSpeechError(event) {
    console.warn('Speech error:', event.error);
  }

  async function speak(text) {
    Speech.stop();
    return new Promise(resolve => {
      Speech.speak(text, {
        language: 'en-US',
        onDone: resolve,
        onStopped: resolve,
        onError: resolve
      });
    });
  }

  async function startSession() {
    const id = uuidv4();
    setSessionId(id);
    setSessionStarted(true);
    // Insert session metadata into DB.
    await executeSql(
      `INSERT INTO sessions (session_id, type, start_time, tech_initials, plant_unit, area, rwp_number, survey_type, instrument_ids, notes)
       VALUES (?, 'dose', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        Date.now(),
        metadata.techInitials,
        metadata.plantUnit,
        metadata.area,
        metadata.rwp,
        metadata.surveyType,
        metadata.instrumentIds,
        metadata.notes
      ]
    );
    await speak('Dose session started. Listening for dose rate entries.');
    startListening();
  }

  async function startListening() {
    if (listening) return;
    setListening(true);
    // Start audio recording.
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recordingRef.current = recording;
    try {
      await Voice.start('en-US');
    } catch (e) {
      console.error('Voice start error:', e);
    }
  }

  async function stopListening() {
    setListening(false);
    try {
      await Voice.stop();
    } catch (e) {
      console.error('Voice stop error:', e);
    }
    // Stop recording.
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync();
    }
  }

  function handleConfirm() {
    // Placeholder: mark last entry as confirmed in DB.
    if (!lastEntry) return;
    executeSql(`UPDATE dose_points SET status = 'confirmed' WHERE id = (SELECT id FROM dose_points ORDER BY timestamp DESC LIMIT 1)`);
    speak('Confirmed.');
    setLastEntry(null);
  }

  function handleUndo() {
    // Delete the most recent entry.
    executeSql(`DELETE FROM dose_points WHERE id = (SELECT id FROM dose_points ORDER BY timestamp DESC LIMIT 1)`);
    speak('Entry deleted.');
    setLastEntry(null);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {!sessionStarted && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session Metadata</Text>
          {Object.keys(metadata).map(key => (
            <TextInput
              key={key}
              style={styles.input}
              placeholder={key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}
              value={metadata[key]}
              onChangeText={text => setMetadata(prev => ({ ...prev, [key]: text }))}
            />
          ))}
          <TouchableOpacity style={styles.button} onPress={startSession}>
            <Text style={styles.buttonText}>Start Session</Text>
          </TouchableOpacity>
        </View>
      )}
      {sessionStarted && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Listening: {listening ? 'On' : 'Off'}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={listening ? stopListening : startListening}
          >
            <Text style={styles.buttonText}>{listening ? 'Pause Listening' : 'Resume Listening'}</Text>
          </TouchableOpacity>
          {lastEntry && (
            <View style={styles.entryBox}>
              <Text>Last Entry:</Text>
              <Text>
                {lastEntry.componentId} - {lastEntry.readingType} {lastEntry.value} {lastEntry.unit}
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                <TouchableOpacity style={styles.smallButton} onPress={handleConfirm}>
                  <Text style={styles.buttonText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallButton} onPress={handleUndo}>
                  <Text style={styles.buttonText}>Undo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <TouchableOpacity
            style={[styles.button, { marginTop: 20 }]} 
            onPress={() => {
              stopListening();
              setSessionStarted(false);
              speak('Session ended.');
              navigation.goBack();
            }}
          >
            <Text style={styles.buttonText}>End Session</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    flexGrow: 1
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 12,
    borderRadius: 4
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12
  },
  smallButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4
  },
  buttonText: {
    color: '#fff',
    fontSize: 16
  },
  entryBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    marginTop: 12
  }
});
