import { useState, useEffect } from 'react';
import { Customer } from '../../types';
import { api } from '../../services/api';

interface CustomerFormProps {
  customer?: Customer | null;
  onSave: () => void;
  onCancel: () => void;
}

interface ShopAccountInfo {
  hasShopAccount: boolean;
  shopAccountEmail: string | null;
}

export function CustomerForm({ customer, onSave, onCancel }: CustomerFormProps) {
  const [formData, setFormData] = useState({
    companyName: '',
    customerCode: '',
    firstName: '',
    lastName: '',
    nip: '',
    street: '',
    postalCode: '',
    city: '',
    country: 'Polska',
    phone: '',
    email: '',
    priceGroupId: 1,
    notes: '',
    // Recipient fields
    recipientCompanyName: '',
    recipientFirstName: '',
    recipientLastName: '',
    recipientStreet: '',
    recipientPostalCode: '',
    recipientCity: '',
    recipientPhone: '',
  });
  const [useRecipient, setUseRecipient] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lookingUpNIP, setLookingUpNIP] = useState(false);

  // Shop account state
  const [shopAccount, setShopAccount] = useState<ShopAccountInfo>({ hasShopAccount: false, shopAccountEmail: null });
  const [shopAccountLoading, setShopAccountLoading] = useState(false);
  const [shopAccountError, setShopAccountError] = useState('');
  const [shopAccountSuccess, setShopAccountSuccess] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (customer) {
      setFormData({
        companyName: customer.companyName || '',
        customerCode: customer.customerCode || '',
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        nip: customer.nip || '',
        street: customer.street,
        postalCode: customer.postalCode,
        city: customer.city,
        country: customer.country,
        phone: customer.phone,
        email: customer.email,
        priceGroupId: customer.priceGroupId,
        notes: customer.notes || '',
        recipientCompanyName: customer.recipientCompanyName || '',
        recipientFirstName: customer.recipientFirstName || '',
        recipientLastName: customer.recipientLastName || '',
        recipientStreet: customer.recipientStreet || '',
        recipientPostalCode: customer.recipientPostalCode || '',
        recipientCity: customer.recipientCity || '',
        recipientPhone: customer.recipientPhone || '',
      });

      // Set useRecipient toggle if customer has recipient data
      setUseRecipient(!!customer.recipientStreet);

      // Load shop account info
      loadShopAccountInfo(customer.id);
    }
  }, [customer]);

  const loadShopAccountInfo = async (customerId: number) => {
    try {
      const response = await api.getCustomer(customerId);
      setShopAccount({
        hasShopAccount: response.hasShopAccount || false,
        shopAccountEmail: response.shopAccountEmail || null,
      });
    } catch (err) {
      console.error('Error loading shop account info:', err);
    }
  };

  const handleCreateShopAccount = async () => {
    if (!customer) return;

    setShopAccountLoading(true);
    setShopAccountError('');
    setShopAccountSuccess('');
    setGeneratedPassword(null);

    try {
      const result = await api.createShopAccount(customer.id);
      setShopAccount({ hasShopAccount: true, shopAccountEmail: result.email });
      setGeneratedPassword(result.password);
      setShopAccountSuccess('Konto w sklepie zostało utworzone');
    } catch (err: any) {
      setShopAccountError(err.response?.data?.error || 'Błąd podczas tworzenia konta');
    } finally {
      setShopAccountLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!customer) return;

    setShopAccountLoading(true);
    setShopAccountError('');
    setShopAccountSuccess('');
    setGeneratedPassword(null);

    try {
      const result = await api.resetShopPassword(customer.id);
      setGeneratedPassword(result.password);
      setShopAccountSuccess('Hasło zostało zresetowane');
    } catch (err: any) {
      setShopAccountError(err.response?.data?.error || 'Błąd podczas resetowania hasła');
    } finally {
      setShopAccountLoading(false);
    }
  };

  const handleRemoveShopAccount = async () => {
    if (!customer) return;

    if (!confirm('Czy na pewno chcesz usunąć konto sklepowe? Klient straci dostęp do sklepu internetowego.')) {
      return;
    }

    setShopAccountLoading(true);
    setShopAccountError('');
    setShopAccountSuccess('');
    setGeneratedPassword(null);

    try {
      await api.removeShopAccount(customer.id);
      setShopAccount({ hasShopAccount: false, shopAccountEmail: null });
      setShopAccountSuccess('Konto w sklepie zostało usunięte');
    } catch (err: any) {
      setShopAccountError(err.response?.data?.error || 'Błąd podczas usuwania konta');
    } finally {
      setShopAccountLoading(false);
    }
  };

  const handleSendCredentialsEmail = async () => {
    if (!customer || !generatedPassword) return;

    setSendingEmail(true);
    setShopAccountError('');

    try {
      await api.sendShopCredentialsEmail(customer.id, generatedPassword);
      setShopAccountSuccess('Email z danymi logowania został wysłany do klienta');
    } catch (err: any) {
      setShopAccountError(err.response?.data?.error || 'Błąd podczas wysyłania emaila');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleLookupNIP = async () => {
    if (!formData.nip || formData.nip.length < 10) {
      setError('Wprowadź poprawny NIP (10 cyfr)');
      return;
    }

    setLookingUpNIP(true);
    setError('');

    try {
      const data = await api.lookupNip(formData.nip);

      // Składanie pełnego adresu z pól zwróconych przez API
      const fullStreet = [data.street, data.houseNumber, data.apartmentNumber ? `/${data.apartmentNumber}` : '']
        .filter(Boolean)
        .join(' ')
        .trim();

      setFormData({
        ...formData,
        companyName: data.name || formData.companyName,
        street: fullStreet || formData.street,
        postalCode: data.postalCode || formData.postalCode,
        city: data.city || formData.city,
      });

      // Sprawdź czy to działalność gospodarcza (nazwa to tylko imię i nazwisko)
      const isIndividualBusiness = data.name && /^[A-ZŁĄĆĘŃÓŚŹŻ]+ [A-ZAŁĄĆĘŃÓŚŹŻ]+$/.test(data.name.trim());

      // Wyświetl informację o sukcesie
      if (data.name) {
        let message = `Znaleziono firmę: ${data.name}\nStatus VAT: ${data.statusVat}`;

        if (isIndividualBusiness) {
          message += '\n\n⚠️ UWAGA: Dla działalności gospodarczych system zwraca tylko imię i nazwisko właściciela.\nJeśli firma ma pełną nazwę (np. "JAN KOWALSKI KWIACIARNIA"), proszę uzupełnić ją ręcznie w polu "Nazwa firmy".';
        }

        alert(message);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd podczas wyszukiwania NIP. Sprawdź czy NIP jest poprawny.');
    } finally {
      setLookingUpNIP(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (customer) {
        await api.updateCustomer(customer.id, formData);
      } else {
        await api.createCustomer(formData);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd podczas zapisywania');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            {customer ? 'Edytuj kontrahenta' : 'Dodaj kontrahenta'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* NIP i lookup */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                NIP (opcjonalnie)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="1234567890"
                  value={formData.nip}
                  onChange={(e) => setFormData({ ...formData, nip: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                />
                <button
                  type="button"
                  onClick={handleLookupNIP}
                  disabled={lookingUpNIP || !formData.nip}
                  className="btn btn-secondary"
                >
                  {lookingUpNIP ? 'Szukam...' : 'Lookup'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Wyszukaj dane firmy po NIP</p>
            </div>

            {/* Nazwa firmy */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nazwa firmy (opcjonalnie)
              </label>
              <input
                type="text"
                className="input"
                placeholder="Firma Sp. z o.o."
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Dla działalności gospodarczych lookup NIP zwraca tylko imię i nazwisko - uzupełnij pełną nazwę ręcznie
              </p>
            </div>

            {/* Kod kontrahenta */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kod kontrahenta (opcjonalnie)
              </label>
              <input
                type="text"
                className="input"
                placeholder="np. KLIENT01"
                value={formData.customerCode}
                onChange={(e) => setFormData({ ...formData, customerCode: e.target.value })}
              />
            </div>

            {/* Imię i nazwisko */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Imię (opcjonalnie)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Jan"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nazwisko (opcjonalnie)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Kowalski"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
            </div>

            {/* Adres */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ulica i numer <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input"
                placeholder="ul. Kwiatowa 123"
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kod pocztowy <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="00-000"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  required
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Miasto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Warszawa"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Kontakt */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (opcjonalnie)
                </label>
                <input
                  type="email"
                  className="input"
                  placeholder="kontakt@firma.pl"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefon (opcjonalnie)
                </label>
                <input
                  type="tel"
                  className="input"
                  placeholder="+48 123 456 789"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            {/* Grupa cenowa */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Grupa cenowa <span className="text-red-500">*</span>
              </label>
              <select
                className="input"
                value={formData.priceGroupId}
                onChange={(e) => setFormData({ ...formData, priceGroupId: parseInt(e.target.value) })}
                required
              >
                <option value={1}>Podstawowa (bez rabatu)</option>
                <option value={2}>Rabat 10%</option>
                <option value={3}>Rabat 12%</option>
                <option value={4}>Rabat 15%</option>
                <option value={5}>Rabat 20%</option>
                <option value={6}>Rabat 25%</option>
              </select>
            </div>

            {/* Notatki */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notatki (opcjonalnie)
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="Dodatkowe informacje..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            {/* Inny adres odbiorcy (dostawy) */}
            <div className="border-t pt-6">
              <label className="flex items-center cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={useRecipient}
                  onChange={(e) => setUseRecipient(e.target.checked)}
                  className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">
                  Inny adres odbiorcy (dostawy)
                </span>
              </label>

              {useRecipient && (
                <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Uzupełnij dane odbiorcy jeśli adres dostawy różni się od adresu nabywcy.
                    Te dane będą automatycznie używane na fakturach dla tego kontrahenta.
                  </p>

                  {/* Nazwa firmy odbiorcy */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nazwa firmy odbiorcy (opcjonalnie)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Firma odbiorcy Sp. z o.o."
                      value={formData.recipientCompanyName}
                      onChange={(e) => setFormData({ ...formData, recipientCompanyName: e.target.value })}
                    />
                  </div>

                  {/* Imię i nazwisko odbiorcy */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Imię odbiorcy (opcjonalnie)
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Jan"
                        value={formData.recipientFirstName}
                        onChange={(e) => setFormData({ ...formData, recipientFirstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nazwisko odbiorcy (opcjonalnie)
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Kowalski"
                        value={formData.recipientLastName}
                        onChange={(e) => setFormData({ ...formData, recipientLastName: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Adres odbiorcy */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ulica i numer odbiorcy <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="ul. Dostawcza 456"
                      value={formData.recipientStreet}
                      onChange={(e) => setFormData({ ...formData, recipientStreet: e.target.value })}
                      required={useRecipient}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Kod pocztowy <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="00-000"
                        value={formData.recipientPostalCode}
                        onChange={(e) => setFormData({ ...formData, recipientPostalCode: e.target.value })}
                        required={useRecipient}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Miasto <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Warszawa"
                        value={formData.recipientCity}
                        onChange={(e) => setFormData({ ...formData, recipientCity: e.target.value })}
                        required={useRecipient}
                      />
                    </div>
                  </div>

                  {/* Telefon odbiorcy */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Telefon odbiorcy (opcjonalnie)
                    </label>
                    <input
                      type="tel"
                      className="input"
                      placeholder="+48 123 456 789"
                      value={formData.recipientPhone}
                      onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Konto sklepu internetowego - tylko dla istniejących kontrahentów */}
            {customer && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Konto sklepu internetowego
                </h3>

                {shopAccountError && (
                  <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {shopAccountError}
                  </div>
                )}

                {shopAccountSuccess && (
                  <div className="bg-green-50 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                    {shopAccountSuccess}
                  </div>
                )}

                {generatedPassword && (
                  <div className="bg-blue-50 border border-blue-400 text-blue-800 px-4 py-3 rounded mb-4">
                    <p className="font-semibold">Dane logowania do sklepu:</p>
                    <p className="mt-1">Email: <span className="font-mono">{shopAccount.shopAccountEmail || formData.email}</span></p>
                    <p>Hasło: <span className="font-mono bg-blue-100 px-2 py-1 rounded">{generatedPassword}</span></p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={handleSendCredentialsEmail}
                        disabled={sendingEmail}
                        className="btn text-sm bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
                      >
                        {sendingEmail ? (
                          <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Wysyłanie...
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Wyślij emailem do klienta
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-sm mt-2 text-blue-600">
                      Możesz też zapisać dane i przekazać je ręcznie.
                    </p>
                  </div>
                )}

                {shopAccount.hasShopAccount ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Konto aktywne
                      </span>
                      <span className="text-gray-600 text-sm">{shopAccount.shopAccountEmail}</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        disabled={shopAccountLoading}
                        className="btn btn-secondary text-sm"
                      >
                        {shopAccountLoading ? 'Proszę czekać...' : 'Resetuj hasło'}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveShopAccount}
                        disabled={shopAccountLoading}
                        className="btn text-sm bg-red-100 text-red-700 hover:bg-red-200"
                      >
                        Usuń konto
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-gray-600 text-sm">
                      Kontrahent nie ma jeszcze konta w sklepie internetowym.
                      Możesz utworzyć konto, aby umożliwić mu składanie zamówień online.
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateShopAccount}
                      disabled={shopAccountLoading}
                      className="btn btn-primary"
                    >
                      {shopAccountLoading ? 'Tworzenie konta...' : 'Utwórz konto sklepowe'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Przyciski */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-1"
              >
                {loading ? 'Zapisywanie...' : 'Zapisz'}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-secondary flex-1"
              >
                Anuluj
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
