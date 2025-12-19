import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Picker } from 'react-native';

export default function SettingsScreen() {
  const [pinLock, setPinLock] = useState(false);
  const [retention, setRetention] = useState('keep');
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Require PIN on launch</Text>
        <Switch value={pinLock} onValueChange={setPinLock} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Audio retention policy</Text>
        {/* simple drop-down replacement for example purposes */}
        <Picker
          selectedValue={retention}
          style={{ flex: 1 }}
          onValueChange={item => setRetention(item)}
        >
          <Picker.Item label="Keep audio indefinitely" value="keep" />
          <Picker.Item label="Delete after confirmed" value="deleteAfterConfirm" />
          <Picker.Item label="Delete after export" value="deleteAfterExport" />
          <Picker.Item label="Delete after 30 days" value="30" />
          <Picker.Item label="No audio retention" value="none" />
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  label: {
    flex: 1,
    fontSize: 16
  }
});
