import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Keyboard, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { api, ApiError, DEMO } from './src/api';
import { Coordinates, Duty, Session, Vehicle, vehicleIdentifier } from './src/models';
import { sessionStore } from './src/storage';

function Button({ title, onPress, secondary = false, danger = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, danger && s.danger, (disabled || pressed) && { opacity: 0.5 }]}><Text style={[s.buttonText, secondary && { color: '#284e85' }]}>{title}</Text></Pressable>;
}
function Row({ label, value }: { label: string; value: string }) { return <View style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>; }
function PinChangeForm({ required, busy, onSubmit }: { required: boolean; busy: boolean; onSubmit: (currentPin: string | undefined, newPin: string) => void }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const valid = /^\d{4,8}$/.test(newPin) && newPin === confirmPin && (required || /^\d{4,8}$/.test(currentPin));
  return <View style={s.card}>
    {!required && <><Text style={s.label}>Current PIN</Text><TextInput accessibilityLabel="Current PIN" style={s.input} value={currentPin} onChangeText={setCurrentPin} keyboardType="number-pad" secureTextEntry maxLength={8} editable={!busy} /></>}
    <Text style={s.label}>New PIN</Text><TextInput accessibilityLabel="New PIN" style={s.input} value={newPin} onChangeText={setNewPin} keyboardType="number-pad" secureTextEntry maxLength={8} editable={!busy} placeholder="Enter 4–8 digits" />
    <Text style={s.label}>Confirm new PIN</Text><TextInput accessibilityLabel="Confirm new PIN" style={s.input} value={confirmPin} onChangeText={setConfirmPin} keyboardType="number-pad" secureTextEntry maxLength={8} editable={!busy} placeholder="Re-enter new PIN" />
    {!!confirmPin && newPin !== confirmPin && <Text style={s.pinMismatch}>PINs do not match.</Text>}
    <Button title="Save new PIN" disabled={busy || !valid} onPress={() => onSubmit(required ? undefined : currentPin, newPin)} />
  </View>;
}
function DriverApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [duty, setDuty] = useState<Duty | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [number, setNumber] = useState('');
  const [scanning, setScanning] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lock = useRef(false);
  const scanLock = useRef(false);
  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const vehicleInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const scrollOffset = useRef(0);
  const vehicleInputFocused = useRef(false);
  useEffect(() => {
    const listener = Keyboard.addListener('keyboardDidShow', event => {
      if (!vehicleInputFocused.current) return;
      setTimeout(() => {
        vehicleInputRef.current?.measureInWindow((_, inputY, __, inputHeight) => {
          const keyboardTop = event.endCoordinates.screenY;
          const overflow = inputY + inputHeight + 24 - keyboardTop;
          if (overflow > 0) scrollViewRef.current?.scrollTo({ y: scrollOffset.current + overflow, animated: true });
        });
      }, 50);
    });
    return () => listener.remove();
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await sessionStore.clear(); setSession(null); setDuty(null); setVehicle(null); setScanning(false);
        setReady(true); setError('Your session has expired. Please log in again.');
      } else {
        if (e instanceof ApiError && e.status === 409) setVehicle(null);
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally { lock.current = false; setBusy(false); }
  }
  async function restore() {
    await run(async () => {
      const saved = await sessionStore.get();
      if (saved) { const active = saved.mustChangePin ? null : await api.current(saved); setSession(saved); setDuty(active); }
      setReady(true);
    });
  }
  useEffect(() => { void restore(); }, []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') setScanning(false);
      else if (session && !session.mustChangePin) void run(async () => { setDuty(await api.current(session)); });
    });
    return () => listener.remove();
  }, [session]);
  async function coordinates(): Promise<Coordinates | null> {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    try {
      const position = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), new Promise<null>(resolve => setTimeout(() => resolve(null), 10000))]);
      return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy } : null;
    } catch { return null; }
  }
  function findVehicle(raw: string) {
    console.log('findVehicle', raw);
    setScanning(false);
    void run(async () => { if (session) { const value = vehicleIdentifier(raw); const found = await api.vehicle(value, session); setNumber(found.number); setVehicle(found); } });
  }
  function toggleScanner() {
    void run(async () => {
      if (scanning) { setScanning(false); return; }
      const result = permission?.granted ? permission : await requestPermission();
      if (result.granted) { scanLock.current = false; setScanning(true); }
      else { setError('Camera access is disabled. Enter the vehicle number manually or enable camera access in Settings.'); }
    });
  }
  function startDuty() {
    void run(async () => {
      if (!session || !vehicle) return;
      const existing = await api.current(session);
      if (existing) { setDuty(existing); return; }
      const location = await coordinates();
      if (!location && !DEMO) throw new Error('Location is required to start duty. Enable location access and GPS, then retry.');
      setDuty(await api.start(session, vehicle, location)); setVehicle(null);
    });
  }
  const title = !session ? 'Driver login' : duty ? 'Duty in progress' : vehicle ? 'Confirm vehicle' : 'Scan vehicle QR';
  const changePin = (currentPin: string | undefined, newPin: string) => void run(async () => {
    if (!session) return;
    await api.changePin(session, currentPin, newPin);
    const updatedSession = { ...session, mustChangePin: false };
    await sessionStore.save(updatedSession);
    setSession(updatedSession);
    setProfileOpen(false);
  });
  return <SafeAreaView style={s.safe}><StatusBar style="light" /><View style={s.header}><View style={s.logo}><Text style={s.logoText}>GMC</Text></View><View style={{ flex: 1 }}><Text style={s.brand}>GMC ICCC</Text><Text style={s.subtitle}>{title}</Text></View>{session && !session.mustChangePin && <Pressable accessibilityRole="button" onPress={() => setProfileOpen(true)} style={s.profileButton}><Text style={s.profileButtonText}>Profile</Text></Pressable>}{DEMO && <Text style={s.badge}>DEMO</Text>}</View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding"><ScrollView ref={scrollViewRef} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onScroll={({ nativeEvent }) => { scrollOffset.current = nativeEvent.contentOffset.y; }}>
      <View style={s.steps}>{['Login', 'Vehicle', 'Duty'].map((label, i) => <View key={label} style={s.step}><View style={[s.dot, (session ? duty ? i <= 2 : i <= 1 : i === 0) && s.dotActive]}><Text style={s.dotText}>{i + 1}</Text></View><Text style={s.stepText}>{label}</Text></View>)}</View>
      {!!error && <View accessibilityRole="alert" style={s.error}><Text style={s.errorText}>{error}</Text></View>}
      {!ready ? <View style={s.card}><Text style={s.heading}>Welcome back</Text><Text style={s.description}>Checking your saved session…</Text>{busy ? <ActivityIndicator color="#284e85" /> : <Button title="Retry" onPress={() => void restore()} />}</View> : !session ? <>
        <Text style={s.eyebrow}>DRIVER PORTAL</Text><Text style={s.heading}>Welcome, Driver</Text><Text style={s.description}>Log in to start your duty. You’ll stay signed in on this device.</Text>
        <View style={s.card}><Text style={s.label}>Driver ID / registered mobile</Text><TextInput accessibilityLabel="Driver ID or registered mobile" style={s.input} value={identifier} onChangeText={setIdentifier} autoCapitalize="characters" autoCorrect={false} placeholder="Enter your driver ID" editable={!busy} /><Text style={s.label}>PIN</Text><TextInput accessibilityLabel="PIN" style={s.input} value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="Enter your PIN" editable={!busy} /><Button disabled={busy || !identifier.trim() || pin.length < 4} title="Log in  →" onPress={() => void run(async () => { const loggedIn = await api.login(identifier.trim(), pin); const active = loggedIn.mustChangePin ? null : await api.current(loggedIn); await sessionStore.save(loggedIn); setSession(loggedIn); setDuty(active); setPin(''); })} /></View>
        {DEMO && <View style={s.info}><Text style={s.infoTitle}>Try the demo</Text><Text style={s.infoText}>Driver ID: DRV-014  ·  PIN: 1234</Text><Text style={s.infoText}>Demo assignments stay on this device.</Text></View>}
      </> : session.mustChangePin ? <>
        <Text style={s.eyebrow}>SECURE YOUR ACCOUNT</Text><Text style={s.heading}>Change your temporary PIN</Text><Text style={s.description}>Set a new 4–8 digit PIN before continuing to your duty.</Text>
        <PinChangeForm required busy={busy} onSubmit={changePin} />
      </> : profileOpen ? <>
        <Text style={s.eyebrow}>DRIVER PROFILE</Text><Text style={s.heading}>Change PIN</Text><Text style={s.description}>For your security, enter your current PIN and choose a new one.</Text>
        <PinChangeForm required={false} busy={busy} onSubmit={changePin} />
        <Button title="Back" secondary disabled={busy} onPress={() => setProfileOpen(false)} />
      </> : duty ? <>
        <View style={s.successIcon}><Text style={s.check}>✓</Text></View><Text style={[s.heading, s.center]}>You’re ready to go</Text><Text style={[s.description, s.center]}>Driver linked to vehicle</Text><View style={s.card}><View style={s.cardTop}><Text style={s.eyebrow}>CURRENT DUTY</Text><Text style={s.active}>● ACTIVE</Text></View><Text style={s.vehicleNumber}>{duty.vehicle.number}</Text><Row label="Driver" value={`${duty.driver.name} (${duty.driver.id})`} /><Row label="Duty started" value={new Date(duty.startedAt).toLocaleString()} /><Row label="Location" value={duty.location ? `${duty.location.latitude.toFixed(5)}, ${duty.location.longitude.toFixed(5)}` : 'Unavailable (demo)'} /><Text style={s.caption}>{DEMO ? 'Saved locally · demo mode' : 'Assignment confirmed by ICCC server'}</Text></View><Button title="End duty" danger disabled={busy} onPress={() => Alert.alert('End your duty?', 'This will remove your active assignment from this vehicle.', [{ text: 'Keep working', style: 'cancel' }, { text: 'End duty', style: 'destructive', onPress: () => void run(async () => { const current = await api.current(session); if (current) await api.end(session, current, await coordinates()); setDuty(null); setVehicle(null); setNumber(''); }) }])} />
      </> : vehicle ? <>
        <Text style={s.eyebrow}>VEHICLE ASSIGNMENT</Text><Text style={s.heading}>Confirm your bus</Text><Text style={s.description}>Check the details below before starting your duty.</Text><View style={s.card}><Text style={s.label}>Vehicle number</Text><Text style={s.vehicleNumber}>{vehicle.number}</Text><Row label="Type" value={vehicle.type} /><Row label="GPS" value={vehicle.gpsOnline ? 'Live · Online' : 'Offline'} /><Row label="Current driver" value={vehicle.currentDriver?.name || 'Unassigned'} /></View>{vehicle.currentDriver && <View style={s.warning}><Text style={s.warningTitle}>This vehicle is already assigned</Text><Text style={s.warningText}>Continuing will end {vehicle.currentDriver.name}’s session and assign this vehicle to you.</Text></View>}<Text style={s.caption}>Your duty start time and current location will be recorded.</Text><Button title="Confirm & start duty" disabled={busy} onPress={startDuty} /><Button title="Choose another vehicle" secondary disabled={busy} onPress={() => { setVehicle(null); setError(''); }} />
      </> : <>
        <Text style={s.eyebrow}>HELLO, {session.driver.name.toUpperCase()}</Text><Text style={s.heading}>Let’s find your bus</Text><Text style={s.description}>Scan the QR code fixed on your vehicle, or enter its number below.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Scan vehicle QR" accessibilityHint="Opens the camera to scan the vehicle QR code" disabled={busy} onPress={toggleScanner} style={({ pressed }) => [s.scanner, pressed && s.scannerPressed, busy && s.scannerDisabled]}>{scanning && permission?.granted ? <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { if (!scanLock.current) { scanLock.current = true; findVehicle(data); } }} /> : <><Text style={s.scanGlyph}>📷</Text><Text style={s.scanTitle}>Scan vehicle QR</Text><Text style={s.scanHint}>Tap to open the camera</Text></>}<View pointerEvents="none" style={s.scanFrame} /></Pressable>
        <Button title={scanning ? 'Stop camera' : 'Open camera'} secondary disabled={busy} onPress={toggleScanner} />
        {permission && !permission.granted && !permission.canAskAgain && <Button title="Open device settings" secondary onPress={() => void Linking.openSettings()} />}
        <View style={s.card}><Text style={s.label}>Vehicle number or ID</Text><TextInput ref={vehicleInputRef} accessibilityLabel="Vehicle number or ID" style={s.input} value={number} onChangeText={setNumber} placeholder="e.g. AS 01 UC 8803" autoCapitalize="characters" autoCorrect={false} editable={!busy} onFocus={() => { vehicleInputFocused.current = true; }} onBlur={() => { vehicleInputFocused.current = false; }} onSubmitEditing={() => findVehicle(number)} returnKeyType="search" /><Button title="Find vehicle  →" disabled={busy || !number.trim()} onPress={() => findVehicle(number)} /></View>{DEMO && <Button title="Use demo bus · AS 01 UC 8803" secondary disabled={busy} onPress={() => findVehicle('AS 01 UC 8803')} />}
      </>}
      {busy && <View style={s.loading}><ActivityIndicator color="#284e85" /><Text style={s.caption}>Please wait…</Text></View>}
      {session && !session.mustChangePin && !duty && <Button title="Sign out" secondary disabled={busy} onPress={() => void run(async () => { await api.logout(session); await sessionStore.clear(); setSession(null); setVehicle(null); setScanning(false); setProfileOpen(false); setPin(''); })} />}
      <Text style={s.footer}>GMC ICCC  ·  Skaplink Technologies</Text>
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><DriverApp /></SafeAreaProvider>; }
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#203b65' }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 18, backgroundColor: '#2e5891' }, logo: { width: 43, height: 43, borderRadius: 22, borderWidth: 2, borderColor: '#a1c5dd', justifyContent: 'center', alignItems: 'center', backgroundColor: '#203b65' }, logoText: { color: 'white', fontWeight: '800', fontSize: 11 }, brand: { color: 'white', fontSize: 20, fontWeight: '800', letterSpacing: 1 }, subtitle: { color: '#d1dff1', fontSize: 12, marginTop: 2 }, badge: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1, backgroundColor: '#4870a3', padding: 7, borderRadius: 5 }, profileButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 7, backgroundColor: '#4870a3' }, profileButtonText: { color: 'white', fontSize: 12, fontWeight: '700' }, content: { flexGrow: 1, backgroundColor: '#f5f7fb', padding: 24, gap: 16, width: '100%', maxWidth: 600, alignSelf: 'center' }, steps: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }, step: { flexDirection: 'row', alignItems: 'center', gap: 8 }, dot: { width: 25, height: 25, backgroundColor: '#b6c1d0', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, dotActive: { backgroundColor: '#2e5891' }, dotText: { color: 'white', fontWeight: '700', fontSize: 11 }, stepText: { color: '#5a6a81', fontSize: 12 }, eyebrow: { color: '#587397', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }, heading: { color: '#203b65', fontSize: 28, fontWeight: '800', letterSpacing: -0.6 }, description: { color: '#69768a', fontSize: 15, lineHeight: 23, marginTop: -7 }, card: { backgroundColor: 'white', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', gap: 13 }, label: { fontSize: 12, color: '#4c5d75', fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#c8d3e1', backgroundColor: '#fafbfd', borderRadius: 8, minHeight: 50, paddingHorizontal: 14, fontSize: 16, color: '#203b65' }, pinMismatch: { color: '#a82b33', fontSize: 12 }, button: { minHeight: 51, borderRadius: 9, backgroundColor: '#203b65', alignItems: 'center', justifyContent: 'center', padding: 14 }, secondary: { backgroundColor: '#e8eef7' }, danger: { backgroundColor: '#c52c32' }, buttonText: { color: 'white', fontSize: 15, fontWeight: '700' }, info: { backgroundColor: '#e8f0fb', borderRadius: 10, padding: 16, gap: 7 }, infoTitle: { color: '#294c80', fontWeight: '700' }, infoText: { color: '#4f6c94', fontSize: 12, lineHeight: 18 }, error: { backgroundColor: '#feeceb', borderRadius: 9, padding: 14 }, errorText: { color: '#a82b33', lineHeight: 21 }, scanner: { height: 260, backgroundColor: '#1c2739', borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 8 }, scannerPressed: { opacity: 0.85 }, scannerDisabled: { opacity: 0.5 }, scanGlyph: { color: '#8ad5b4', fontSize: 56, lineHeight: 64 }, scanTitle: { color: 'white', fontSize: 17, fontWeight: '700' }, scanHint: { color: '#bdcadb', fontSize: 11 }, scanFrame: { position: 'absolute', top: 24, bottom: 24, left: 28, right: 28, borderWidth: 2, borderColor: '#73cda5', borderRadius: 12 }, vehicleNumber: { color: '#203b65', fontSize: 26, fontWeight: '800', marginBottom: 4 }, row: { flexDirection: 'row', gap: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#edf0f5' }, rowLabel: { width: 86, color: '#6b7789', fontSize: 12 }, rowValue: { flex: 1, color: '#263c58', fontSize: 13, fontWeight: '500' }, warning: { backgroundColor: '#fff2db', padding: 16, borderRadius: 10, gap: 7 }, warningTitle: { color: '#946009', fontWeight: '700', fontSize: 13 }, warningText: { color: '#8a672d', fontSize: 13, lineHeight: 20 }, caption: { color: '#728095', fontSize: 12, lineHeight: 19 }, successIcon: { alignSelf: 'center', backgroundColor: '#e0f0db', width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, check: { color: '#416d2e', fontSize: 44, fontWeight: '800' }, center: { textAlign: 'center' }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, active: { color: '#387749', fontSize: 11, fontWeight: '800' }, loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, footer: { color: '#8a96a7', fontSize: 11, textAlign: 'center', marginTop: 'auto', paddingTop: 24, paddingBottom: 8 },
});
