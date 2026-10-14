import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { GeoPoint, Gender } from '@pijar/shared';
import { Button, Card, COLORS, Divider, Row, Typography } from '../../src/components/ui';
import { rupiah, formatDistance } from '../../src/lib/format';
import { useServices } from '../../src/store/catalog';
import { useOrders } from '../../src/store/orders';
import { ApiError } from '../../src/lib/api';
import { getCurrentLocation, reverseGeocode, searchAddress, ResolvedAddress } from '../../src/lib/geo';
import { useRouter, useLocalSearchParams } from 'expo-router';


export default function NewOrder() {
  const params = useLocalSearchParams<{ serviceId?: string }>();
  const services = useServices((s) => s.services);
  const servicesLoading = useServices((s) => s.loading);
  const servicesError = useServices((s) => s.error);
  const createOrder = useOrders((s) => s.createOrder);
  const fetchServices = useServices((s) => s.fetchServices);
  const router = useRouter();
  const [serviceId, setServiceId] = useState<string | null>(params.serviceId ?? null);
  const [address, setAddress] = useState<ResolvedAddress | null>(null);
  const [detail, setDetail] = useState('');
  const [price, setPrice] = useState('');
  const [genderPref, setGenderPref] = useState<Gender | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ResolvedAddress[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [confirmedPoint, setConfirmedPoint] = useState<ResolvedAddress | null>(null);

  useEffect(() => {
    if (services.length === 0) void fetchServices();
  }, [services.length, fetchServices]);

  // Deteksi lokasi hanya saran awal; tanpa GPS, customer wajib memilih titik manual.
  useEffect(() => {
    void (async () => {
      const loc = await getCurrentLocation();
      setLocating(false);
      if (!loc) {
        setLocationError('Lokasi tidak terdeteksi — izinkan akses lokasi atau cari alamat Anda di bawah.');
        return;
      }
      setAddress(await reverseGeocode(loc));
      setLocationError(null);
    })();
  }, []);


  const service = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  const enteredPrice = Number(price.replace(/[^0-9]/g, ''));
  const minPrice = service ? Math.floor(service.basePrice * 0.5) : 0;
  const priceHint =
    service && enteredPrice > 0
      ? enteredPrice < minPrice
        ? `Tawaran minimum ${rupiah(minPrice)} (50% harga layanan)`
        : enteredPrice < service.basePrice
          ? 'Menawar — terapis bisa menerima atau menawar balik'
          : 'Harga normal — terapis biasanya langsung menerima'
      : null;

  async function runSearch() {
    setSearching(true);
    try {
      setSearchResults(await searchAddress(searchQuery));
    } finally {
      setSearching(false);
    }
  }

  async function submit() {
    setError(null);
    if (!service) return setError('Pilih layanan dulu');
    if (!confirmedPoint) return setError('Konfirmasi titik lokasi Anda dulu (pilih alamat lalu tekan Gunakan lokasi ini)');
    if (detail.trim().length < 5) return setError('Detail alamat minimal 5 karakter (nomor rumah/patokan)');
    if (enteredPrice < minPrice) return setError(`Tawaran terlalu rendah — minimum ${rupiah(minPrice)}`);

    setBusy(true);
    try {
      const order = await createOrder({
        serviceId: service.id,
        addressLabel: confirmedPoint.label.slice(0, 100),
        addressDetail: detail.trim().slice(0, 500),
        location: confirmedPoint.location,
        customerPrice: enteredPrice,
        therapistGenderPreference: genderPref,
        notes: notes.trim() || undefined,
      });
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.display : 'Gagal membuat pesanan');
    } finally {
      setBusy(false);
    }
  }

  if (services.length === 0) {
    if (servicesLoading) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Typography variant="muted" style={{ marginTop: 12 }}>
            Memuat layanan…
          </Typography>
        </View>
      );
    }
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Typography variant="body" style={{ color: COLORS.danger, textAlign: 'center' }}>
          {servicesError ?? 'Layanan tidak dapat dimuat'}
        </Typography>
        <Button
          title="Coba Lagi"
          variant="outline"
          onPress={() => void fetchServices()}
        />
        <Button
          title="Kembali"
          variant="ghost"
          onPress={() => router.back()}
        />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* 1. Layanan */}
      <Card>
        <Typography variant="h2">1. Pilih Layanan</Typography>
        <Divider />
        <View style={{ gap: 8 }}>
          {services.map((s) => {
            const selected = s.id === serviceId;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  setServiceId(s.id);
                  if (!price || Number(price) === 0) setPrice(String(s.basePrice));
                }}
                style={{
                  borderWidth: 1.5,
                  borderColor: selected ? COLORS.primary : COLORS.border,
                  backgroundColor: selected ? '#FFF7ED' : '#fff',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', color: COLORS.text }}>{s.name}</Text>
                  <Text style={{ fontWeight: '800', color: COLORS.primaryDark }}>{rupiah(s.basePrice)}</Text>
                </Row>
                <Typography variant="small" style={{ marginTop: 2 }}>
                  {s.durationMinutes} menit · {s.description}
                </Typography>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* 2. Alamat */}
      <Card>
        <Typography variant="h2">2. Alamat</Typography>
        <Divider />
        <Row style={{ gap: 8 }}>
          <TextInput
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 10,
              padding: 10,
              color: COLORS.text,
              backgroundColor: '#fff',
            }}
            placeholder="Cari alamat (mis. Jl. Sudirman 1)"
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => void runSearch()}
            returnKeyType="search"
          />
          <Button title="Cari" variant="outline" onPress={() => void runSearch()} disabled={searchQuery.trim().length < 3} />
        </Row>
        {searching ? <Typography variant="small" style={{ marginTop: 6 }}>Mencari…</Typography> : null}
        {searchResults.map((r) => (
          <Pressable
            key={`${r.location.lat},${r.location.lng}`}
            onPress={() => {
              setAddress(r);
              setConfirmedPoint(null);
              setSearchResults([]);
              setSearchQuery('');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Pilih alamat ${r.label}`}
            style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
          >
            <Typography variant="body">{r.label}</Typography>
            <Typography variant="small" numberOfLines={1}>
              {r.detail}
            </Typography>
          </Pressable>
        ))}

        {address ? (
          <View style={{ marginTop: 10 }}>
            <MapView
              style={{ height: 180, borderRadius: 12 }}
              initialRegion={{
                latitude: address.location.lat,
                longitude: address.location.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              region={{
                latitude: address.location.lat,
                longitude: address.location.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker
                coordinate={{ latitude: address.location.lat, longitude: address.location.lng }}
                title={address.label}
                description={address.detail}
                pinColor={COLORS.primary}
              />
            </MapView>
            <Typography variant="small" style={{ marginTop: 6 }}>
              Titik: {address.label} —
              {' '}{address.location.lat.toFixed(5)}, {address.location.lng.toFixed(5)}
            </Typography>
            {confirmedPoint?.location.lat === address.location.lat &&
            confirmedPoint?.location.lng === address.location.lng ? (
              <Typography variant="small" style={{ color: COLORS.success, marginTop: 6 }}>
                ✓ Lokasi ini akan dipakai untuk pesanan Anda
              </Typography>
            ) : null}
            <Button
              title={confirmedPoint?.location.lat === address.location.lat &&
                confirmedPoint?.location.lng === address.location.lng
                ? 'Lokasi Terkonfirmasi ✓'
                : 'Gunakan lokasi ini'}
              variant={confirmedPoint?.location.lat === address.location.lat &&
                confirmedPoint?.location.lng === address.location.lng ? 'outline' : 'primary'}
              disabled={confirmedPoint?.location.lat === address.location.lat &&
                confirmedPoint?.location.lng === address.location.lng}
              onPress={() => {
                setConfirmedPoint(address);
                setLocationError(null);
              }}
              style={{ marginTop: 8 }}
            />
            <TextInput
              style={{
                marginTop: 8,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 10,
                padding: 10,
                color: COLORS.text,
                backgroundColor: '#fff',
              }}
              placeholder="Detail: blok/nomor rumah, patokan, nomor unit…"
              placeholderTextColor={COLORS.textMuted}
              onChangeText={setDetail}
              multiline
              accessibilityLabel="Detail alamat pesanan"
            />
          </View>
        ) : locating ? (
          <Typography variant="muted" style={{ marginTop: 8 }}>
            Mendeteksi lokasi GPS…
          </Typography>
        ) : (
          <View style={{ marginTop: 8, gap: 8 }}>
            <Typography variant="body" style={{ color: COLORS.danger }}>
              {locationError ?? 'Pilih lokasi pesanan Anda'}
            </Typography>
            <Button
              title="Coba Deteksi Ulang"
              variant="outline"
              onPress={() => {
                setLocating(true);
                setLocationError(null);
                void (async () => {
                  const loc = await getCurrentLocation();
                  setLocating(false);
                  if (!loc) {
                    setLocationError('Lokasi masih tidak terdeteksi — cari alamat Anda di kolom pencarian.');
                    return;
                  }
                  setAddress(await reverseGeocode(loc));
                })();
              }}
            />
          </View>
        )}
      </Card>

      {/* 3. Preferensi & tawaran */}
      <Card>
        <Typography variant="h2">3. Preferensi Terapis & Tawaran</Typography>
        <Divider />
        <Typography variant="muted">Preferensi gender terapis (opsional)</Typography>
        <Row style={{ gap: 8, marginTop: 8 }}>
          {([null, 'FEMALE', 'MALE'] as const).map((g) => {
            const label = g === null ? 'Tanpa preferensi' : g === 'FEMALE' ? 'Wanita' : 'Pria';
            const selected = genderPref === g;
            return (
              <Pressable
                key={label}
                onPress={() => setGenderPref(g)}
                style={{
                  flex: 1,
                  borderWidth: 1.5,
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderColor: selected ? COLORS.primary : COLORS.border,
                  backgroundColor: selected ? '#FFF7ED' : '#fff',
                }}
              >
                <Text style={{ color: selected ? COLORS.primaryDark : COLORS.textMuted, fontWeight: '600' }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </Row>

        <Typography variant="muted" style={{ marginTop: 16 }}>Tawaran harga Anda (Rp)</Typography>
        <TextInput
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 10,
            padding: 12,
            fontSize: 18,
            color: COLORS.text,
            backgroundColor: '#fff',
          }}
          keyboardType="number-pad"
          value={price ? rupiah(enteredPrice).replace('Rp', '').trim() : ''}
          onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, ''))}
        />
        {priceHint ? (
          <Typography
            variant="small"
            style={{
              marginTop: 6,
              color: enteredPrice < minPrice ? COLORS.danger : COLORS.textMuted,
            }}
          >
            {priceHint} {service ? `(harga normal ${rupiah(service.basePrice)})` : ''}
          </Typography>
        ) : null}

        <TextInput
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 10,
            padding: 10,
            color: COLORS.text,
            backgroundColor: '#fff',
          }}
          placeholder="Catatan untuk terapis (opsional)"
          placeholderTextColor={COLORS.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </Card>

      {error ? (
        <Typography variant="body" style={{ color: COLORS.danger }}>
          {error}
        </Typography>
      ) : null}

      <Button title="Kirim Pesanan" onPress={() => void submit()} loading={busy} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
