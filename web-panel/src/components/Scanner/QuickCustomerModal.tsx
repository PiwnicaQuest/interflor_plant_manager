import { useState, useEffect } from 'react';
import { API } from '../../services/api';
import type { Customer, PriceGroup } from '../../types';

interface QuickCustomerModalProps {
  onClose: () => void;
  onCustomerCreated: (customer: Customer) => void;
}

interface FormData {
  companyName: string;
  firstName: string;
  lastName: string;
  nip: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  priceGroupId: number;
}

export function QuickCustomerModal({ onClose, onCustomerCreated }: QuickCustomerModalProps) {
  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    firstName: '',
    lastName: '',
    nip: '',
    email: '',
    phone: '',
    street: '',
    postalCode: '',
    city: '',
    priceGroupId: 1,
  });

  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nipLookupLoading, setNipLookupLoading] = useState(false);

  useEffect(() => {
    loadPriceGroups();
  }, []);

  const loadPriceGroups = async () => {
    try {
      const result = await API.getPriceGroups();
      setPriceGroups(result.priceGroups || []);
      if (result.priceGroups?.length > 0) {
        setFormData(prev => ({ ...prev, priceGroupId: result.priceGroups[0].id }));
      }
    } catch (err) {
      console.error('Error loading price groups:', err);
    }
  };

  const handleNipLookup = async () => {
    if (!formData.nip || formData.nip.length < 10) {
      setError('Podaj poprawny NIP (10 cyfr)');
      return;
    }

    setNipLookupLoading(true);
    setError(null);

    try {
      const result = await API.lookupNip(formData.nip);
      if (result.name) {
        const fullStreet = result.street
          ? `${result.street}${result.houseNumber ? ' ' + result.houseNumber : ''}${result.apartmentNumber ? '/' + result.apartmentNumber : ''}`
          : '';
        setFormData(prev => ({
          ...prev,
          companyName: result.name || prev.companyName,
          street: fullStreet || prev.street,
          postalCode: result.postalCode || prev.postalCode,
          city: result.city || prev.city,
        }));
      }
    } catch (err: any) {
      setError('Nie znaleziono firmy o podanym NIP');
    } finally {
      setNipLookupLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.companyName.trim()) {
      setError('Nazwa firmy jest wymagana');
      return;
    }
    if (!formData.street.trim()) {
      setError('Ulica jest wymagana');
      return;
    }
    if (!formData.postalCode.trim()) {
      setError('Kod pocztowy jest wymagany');
      return;
    }
    if (!formData.city.trim()) {
      setError('Miasto jest wymagane');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const customerData: Partial<Customer> = {
        companyName: formData.companyName.trim(),
        street: formData.street.trim(),
        postalCode: formData.postalCode.trim(),
        city: formData.city.trim(),
        country: 'Polska',
        priceGroupId: formData.priceGroupId,
      };

      // Add optional fields if provided
      if (formData.firstName.trim()) customerData.firstName = formData.firstName.trim();
      if (formData.lastName.trim()) customerData.lastName = formData.lastName.trim();
      if (formData.nip.trim()) customerData.nip = formData.nip.trim();
      if (formData.email.trim()) customerData.email = formData.email.trim();
      if (formData.phone.trim()) customerData.phone = formData.phone.trim();

      const result = await API.createCustomer(customerData);

      // Create a customer object to pass back
      const newCustomer: Customer = {
        id: result.customerId,
        companyName: customerData.companyName,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        nip: customerData.nip,
        email: customerData.email || '',
        phone: customerData.phone || '',
        street: customerData.street || '',
        postalCode: customerData.postalCode || '',
        city: customerData.city || '',
        country: 'Polska',
        priceGroupId: customerData.priceGroupId || 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      onCustomerCreated(newCustomer);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Nie udało się utworzyć kontrahenta');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Nowy kontrahent</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* NIP with lookup */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NIP (opcjonalnie)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.nip}
                onChange={(e) => handleChange('nip', e.target.value.replace(/\D/g, ''))}
                placeholder="0000000000"
                maxLength={10}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <button
                type="button"
                onClick={handleNipLookup}
                disabled={nipLookupLoading || formData.nip.length < 10}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-700 rounded-lg text-sm font-medium"
              >
                {nipLookupLoading ? '...' : 'Pobierz'}
              </button>
            </div>
          </div>

          {/* Company Name - Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nazwa firmy <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) => handleChange('companyName', e.target.value)}
              placeholder="Nazwa firmy"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>

          {/* First/Last Name - Optional */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Imie</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                placeholder="Jan"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nazwisko</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
                placeholder="Kowalski"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Email & Phone - Optional */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="email@firma.pl"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+48 000 000 000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Address - Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ulica <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.street}
              onChange={(e) => handleChange('street', e.target.value)}
              placeholder="ul. Przykladowa 1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kod <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.postalCode}
                onChange={(e) => handleChange('postalCode', e.target.value)}
                placeholder="00-000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Miasto <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="Warszawa"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>
          </div>

          {/* Price Group */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grupa cenowa</label>
            <select
              value={formData.priceGroupId}
              onChange={(e) => handleChange('priceGroupId', Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {priceGroups.map(pg => (
                <option key={pg.id} value={pg.id}>{pg.name}</option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Dodawanie...
                </>
              ) : (
                'Dodaj kontrahenta'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
