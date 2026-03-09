import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { User, UserRole, CreateUserRequest, UpdateUserRequest, ChangePasswordRequest, PriceGroup, Customer, CreatePriceGroupRequest, UpdatePriceGroupRequest } from '../types';
import { CreateUserModal } from '../components/Users/CreateUserModal';
import { EditUserModal } from '../components/Users/EditUserModal';
import { ChangePasswordModal } from '../components/Users/ChangePasswordModal';
import { CreatePriceGroupModal } from '../components/PriceGroups/CreatePriceGroupModal';
import { EditPriceGroupModal } from '../components/PriceGroups/EditPriceGroupModal';
import { GrowerPassportsTab } from '../components/Settings/GrowerPassportsTab';
import { TagsTab } from '../components/Settings/TagsTab';
import { PrinterSettingsTab } from '../components/Settings/PrinterSettingsTab';
import PermissionProfilesTab from '../components/settings/PermissionProfilesTab';
import { LoginHistoryTab } from '../components/Settings/LoginHistoryTab';
import { WebsiteSettingsTab } from '../components/Settings/WebsiteSettingsTab';
import { KsefSettingsTab } from '../components/Settings/KsefSettingsTab';

interface PricingSettings {
  costPercentage: number;
  marginPercentage: number;
  eurToPlnRate: number;
}

interface CompanySettings {
  companyName: string;
  nip: string;
  regon: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankAccount: string;
  bankSwift: string;
  invoiceComment: string;
}

interface EmailImportSettings {
  emailAddress: string;
  emailPassword: string;
  imapServer: string;
  imapPort: number;
  smtpServer: string;
  smtpPort: number;
  smtpSecurity: 'none' | 'ssl' | 'starttls';
  enabled: boolean;
}

interface SmtpSendSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
  smtpSecurity: 'none' | 'ssl' | 'starttls';
}

type TabType = 'company' | 'pricing' | 'email-import' | 'smtp-send' | 'users' | 'login-history' | 'price-groups' | 'printers' | 'grower-passports' | 'tags' | 'profiles' | 'website' | 'ksef';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('company');
  const [printerSubTab, setPrinterSubTab] = useState<'agent'>('agent');

  // Pricing settings state
  const [pricingSettings, setPricingSettings] = useState<PricingSettings>({
    costPercentage: 0,
    marginPercentage: 100,
    eurToPlnRate: 4.30,
  });
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingSaving, setPricingSaving] = useState(false);

  // Company settings state
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
    companyName: '',
    nip: '',
    regon: '',
    street: '',
    postalCode: '',
    city: '',
    country: 'Polska',
    phone: '',
    email: '',
    website: '',
    bankName: '',
    bankAccount: '',
    bankSwift: '',
    invoiceComment: '',
  });
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companySaving, setCompanySaving] = useState(false);

  // Email import settings state
  const [emailSettings, setEmailSettings] = useState<EmailImportSettings>({
    emailAddress: '',
    emailPassword: '',
    imapServer: '',
    imapPort: 993,
    smtpServer: '',
    smtpPort: 587,
    smtpSecurity: 'starttls',
    enabled: false,
  });
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);

  // SMTP send settings state
  const [smtpSendSettings, setSmtpSendSettings] = useState<SmtpSendSettings>({
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassword: '',
    smtpFrom: '',
    smtpSecurity: 'starttls',
  });
  const [smtpSendLoading, setSmtpSendLoading] = useState(true);
  const [smtpSendSaving, setSmtpSendSaving] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    emailsFound: number;
    emailsProcessed: number;
    productsImported: number;
    productsUpdated: number;
    productsFailed: number;
    errors: string[];
  } | null>(null);
  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [changingPasswordUser, setChangingPasswordUser] = useState<User | null>(null);

  // Price groups state
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
  const [priceGroupsLoading, setPriceGroupsLoading] = useState(true);
  const [showCreatePriceGroupModal, setShowCreatePriceGroupModal] = useState(false);
  const [editingPriceGroup, setEditingPriceGroup] = useState<PriceGroup | null>(null);
  const [viewingCustomers, setViewingCustomers] = useState<{ priceGroup: PriceGroup; customers: Customer[] } | null>(null);

  // Common state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load data based on active tab
  useEffect(() => {
    if (activeTab === 'pricing') {
      fetchPricingSettings();
    } else if (activeTab === 'company') {
      fetchCompanySettings();
    } else if (activeTab === 'email-import') {
      fetchEmailSettings();
    } else if (activeTab === 'smtp-send') {
      fetchSmtpSendSettings();
    } else if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'price-groups') {
      fetchPriceGroups();
    }
  }, [activeTab]);

  // Initial load
  useEffect(() => {
    fetchCompanySettings();
  }, []);

  // Fetch functions
  const fetchPricingSettings = async () => {
    try {
      setPricingLoading(true);
      const data = await api.getPricingSettings();
      setPricingSettings(data);
    } catch (err) {
      console.error('Error fetching pricing settings:', err);
      setError('Błąd podczas ładowania ustawień cenowych');
    } finally {
      setPricingLoading(false);
    }
  };

  const fetchCompanySettings = async () => {
    try {
      setCompanyLoading(true);
      const data = await api.getCompanySettings();
      setCompanySettings({ ...data, invoiceComment: (data as any).invoiceComment || '' });
    } catch (err) {
      console.error('Error fetching company settings:', err);
    } finally {
      setCompanyLoading(false);
    }
  };

  const fetchEmailSettings = async () => {
    try {
      setEmailLoading(true);
      const data = await api.getEmailImportSettings();
      setEmailSettings(data as EmailImportSettings);
    } catch (err) {
      console.error('Error fetching email settings:', err);
    } finally {
      setEmailLoading(false);
    }
  };


  const fetchSmtpSendSettings = async () => {
    try {
      setSmtpSendLoading(true);
      const data = await api.getSmtpSendSettings();
      setSmtpSendSettings(data);
    } catch (err) {
      console.error('Error fetching SMTP send settings:', err);
    } finally {
      setSmtpSendLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const data = await api.getUsers();
      setUsers(data.users);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd ładowania użytkowników');
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchPriceGroups = async () => {
    try {
      setPriceGroupsLoading(true);
      const data = await api.getPriceGroups();
      setPriceGroups(data.priceGroups);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd ładowania grup cenowych');
    } finally {
      setPriceGroupsLoading(false);
    }
  };

  // Save functions
  const handleSavePricing = async () => {
    try {
      setPricingSaving(true);
      setError('');
      setSuccess('');
      await api.updatePricingSettings(pricingSettings);
      setSuccess('Ustawienia cenowe zostały zapisane');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error saving pricing settings:', err);
      setError('Błąd podczas zapisywania ustawień cenowych');
    } finally {
      setPricingSaving(false);
    }
  };

  const handleSaveCompany = async () => {
    try {
      setCompanySaving(true);
      setError('');
      setSuccess('');
      await api.updateCompanySettings(companySettings);
      setSuccess('Dane firmy zostały zapisane');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error saving company settings:', err);
      setError(err.response?.data?.error || 'Błąd podczas zapisywania danych firmy');
    } finally {
      setCompanySaving(false);
    }
  };

  const handleSaveEmail = async () => {
    try {
      setEmailSaving(true);
      setError('');
      setSuccess('');
      await api.updateEmailImportSettings(emailSettings);
      setSuccess('Ustawienia importu email zostały zapisane');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error saving email settings:', err);
      setError(err.response?.data?.error || 'Błąd podczas zapisywania ustawień email');
    } finally {
      setEmailSaving(false);
    }
  };

  const handleSaveSmtpSend = async () => {
    try {
      setSmtpSendSaving(true);
      setError('');
      setSuccess('');
      await api.updateSmtpSendSettings(smtpSendSettings);
      setSuccess('Ustawienia SMTP wysyłki zostały zapisane');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error saving SMTP send settings:', err);
      setError(err.response?.data?.error || 'Błąd podczas zapisywania ustawień SMTP');
    } finally {
      setSmtpSendSaving(false);
    }
  };

  const handleTestSmtpSend = async () => {
    if (!smtpTestEmail) {
      setError('Podaj adres email do testu');
      return;
    }
    try {
      setSmtpTesting(true);
      setError('');
      setSuccess('');
      const result = await api.testSmtpSend(smtpTestEmail);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(result.message || 'Email testowy wysłany pomyślnie');
        setTimeout(() => setSuccess(''), 5000);
      }
    } catch (err: any) {
      console.error('SMTP test error:', err);
      setError(err.response?.data?.error || 'Błąd wysyłki testowej');
    } finally {
      setSmtpTesting(false);
    }
  };


  const handleSync = async () => {
    try {
      setSyncLoading(true);
      setSyncResult(null);
      setError('');
      setSuccess('');
      const response = await api.syncEmailImport();
      if (response.success && response.result) {
        setSyncResult(response.result);
        if (response.result.productsImported > 0 || response.result.productsUpdated > 0) {
          setSuccess(`Zaimportowano ${response.result.productsImported} nowych produktów, zaktualizowano ${response.result.productsUpdated}`);
        } else if (response.result.emailsFound === 0) {
          setSuccess('Brak nowych emaili do przetworzenia');
        } else {
          setSuccess('Synchronizacja zakończona');
        }
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(response.error || 'Błąd synchronizacji');
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      setError(err.response?.data?.error || 'Błąd podczas synchronizacji email');
    } finally {
      setSyncLoading(false);
    }
  };

  // User functions
  const handleCreateUser = async (data: CreateUserRequest) => {
    await api.createUser(data);
    await fetchUsers();
  };

  const handleUpdateUser = async (data: UpdateUserRequest) => {
    if (!editingUser) return;
    await api.updateUser(editingUser.id, data);
    await fetchUsers();
  };

  const handleToggleUserActive = async (userId: number) => {
    if (!confirm('Czy na pewno chcesz zmienić status aktywności tego użytkownika?')) return;
    try {
      await api.toggleUserActive(userId);
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Błąd zmiany statusu');
    }
  };

  const handleChangePassword = async (data: ChangePasswordRequest) => {
    if (!changingPasswordUser) return;
    await api.changeUserPassword(changingPasswordUser.id, data);
  };

  const handleDeleteUser = async (userId: number, userEmail: string) => {
    if (!confirm(`Czy na pewno chcesz dezaktywować użytkownika ${userEmail}?`)) return;
    try {
      await api.deleteUser(userId);
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Błąd usuwania użytkownika');
    }
  };

  const handlePermanentDelete = async (userId: number, userEmail: string) => {
    if (!confirm(`UWAGA: Trwale usuniesz użytkownika ${userEmail}.\nTo działanie jest NIEODWRACALNE!\nCzy na pewno chcesz kontynuować?`)) return;
    try {
      await api.permanentlyDeleteUser(userId);
      await fetchUsers();
      setSuccess(`Użytkownik ${userEmail} został trwale usunięty`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Błąd trwałego usuwania użytkownika');
    }
  };

  // Price group functions
  const handleCreatePriceGroup = async (data: CreatePriceGroupRequest) => {
    await api.createPriceGroup(data);
    await fetchPriceGroups();
  };

  const handleUpdatePriceGroup = async (id: number, data: UpdatePriceGroupRequest) => {
    await api.updatePriceGroup(id, data);
    await fetchPriceGroups();
  };

  const handleDeletePriceGroup = async (priceGroup: PriceGroup) => {
    if (priceGroup.id === 1) {
      alert('Nie można usunąć domyślnej grupy cenowej');
      return;
    }
    const customerCount = priceGroup.customerCount || 0;
    if (customerCount > 0) {
      alert(`Nie można usunąć grupy cenowej. ${customerCount} klient(ów) jest przypisanych do tej grupy.`);
      return;
    }
    if (!confirm(`Czy na pewno chcesz usunąć grupę cenową "${priceGroup.name}"?`)) return;
    try {
      await api.deletePriceGroup(priceGroup.id);
      await fetchPriceGroups();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Błąd usuwania grupy cenowej');
    }
  };

  const handleViewCustomers = async (priceGroup: PriceGroup) => {
    try {
      const data = await api.getPriceGroupCustomers(priceGroup.id);
      setViewingCustomers({ priceGroup, customers: data.customers });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Błąd ładowania klientów');
    }
  };

  // Helper functions
  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return 'bg-red-100 text-red-800';
      case UserRole.WAREHOUSE: return 'bg-blue-100 text-blue-800';
      case UserRole.POS: return 'bg-green-100 text-green-800';
      case UserRole.CUSTOMER: return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return 'Administrator';
      case UserRole.WAREHOUSE: return 'Magazynier';
      case UserRole.POS: return 'Kasjer';
      case UserRole.CUSTOMER: return 'Klient';
      default: return role;
    }
  };

  const tabs = [
    { id: 'company' as TabType, label: 'Dane firmy' },
    { id: 'pricing' as TabType, label: 'Ustawienia cenowe' },
    { id: 'email-import' as TabType, label: 'Import z email' },
    { id: 'smtp-send' as TabType, label: 'Wysyłka email' },
    { id: 'users' as TabType, label: 'Użytkownicy' },
    { id: 'login-history' as TabType, label: 'Historia logowań' },
    { id: 'price-groups' as TabType, label: 'Grupy cenowe' },
    { id: 'printers' as TabType, label: 'Drukarki' },
    { id: 'grower-passports' as TabType, label: 'Ogrodnicy i paszporty' },
    { id: 'tags' as TabType, label: 'Tagi' },
    { id: 'profiles' as TabType, label: 'Profile uprawnień' },
    { id: 'ksef' as TabType, label: 'KSeF' },
    { id: 'website' as TabType, label: 'Strona internetowa' },
  ];

  return (
    <div className="px-3 py-2">
      <h1 className="text-2xl font-bold mb-6">Ustawienia</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">×</button>
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-primary-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Company Settings Tab */}
      {activeTab === 'company' && (
        <div className="bg-white rounded-lg shadow p-6 max-w-3xl">
          <h2 className="text-lg font-semibold mb-4">Dane firmy</h2>
          <p className="text-sm text-gray-500 mb-6">
            Te dane będą widoczne na fakturach i paragonach.
          </p>

          {companyLoading ? (
            <div className="text-gray-500">Ładowanie...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nazwa firmy *
                  </label>
                  <input
                    type="text"
                    value={companySettings.companyName}
                    onChange={(e) => setCompanySettings({ ...companySettings, companyName: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    NIP *
                  </label>
                  <input
                    type="text"
                    value={companySettings.nip}
                    onChange={(e) => setCompanySettings({ ...companySettings, nip: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="0000000000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  REGON
                </label>
                <input
                  type="text"
                  value={companySettings.regon}
                  onChange={(e) => setCompanySettings({ ...companySettings, regon: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-3">Adres</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ulica i numer *
                    </label>
                    <input
                      type="text"
                      value={companySettings.street}
                      onChange={(e) => setCompanySettings({ ...companySettings, street: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kod pocztowy *
                    </label>
                    <input
                      type="text"
                      value={companySettings.postalCode}
                      onChange={(e) => setCompanySettings({ ...companySettings, postalCode: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="00-000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Miasto *
                    </label>
                    <input
                      type="text"
                      value={companySettings.city}
                      onChange={(e) => setCompanySettings({ ...companySettings, city: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kraj
                    </label>
                    <input
                      type="text"
                      value={companySettings.country}
                      onChange={(e) => setCompanySettings({ ...companySettings, country: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-3">Kontakt</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Telefon
                    </label>
                    <input
                      type="text"
                      value={companySettings.phone}
                      onChange={(e) => setCompanySettings({ ...companySettings, phone: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={companySettings.email}
                      onChange={(e) => setCompanySettings({ ...companySettings, email: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Strona internetowa
                    </label>
                    <input
                      type="text"
                      value={companySettings.website}
                      onChange={(e) => setCompanySettings({ ...companySettings, website: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="https://"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-3">Dane bankowe</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nazwa banku
                    </label>
                    <input
                      type="text"
                      value={companySettings.bankName}
                      onChange={(e) => setCompanySettings({ ...companySettings, bankName: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Numer konta
                    </label>
                    <input
                      type="text"
                      value={companySettings.bankAccount}
                      onChange={(e) => setCompanySettings({ ...companySettings, bankAccount: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                      placeholder="00 0000 0000 0000 0000 0000 0000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SWIFT/BIC
                    </label>
                    <input
                      type="text"
                      value={companySettings.bankSwift}
                      onChange={(e) => setCompanySettings({ ...companySettings, bankSwift: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Komentarz na fakturze */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-md font-medium text-gray-900 mb-4">Komentarz na fakturze</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Treść komentarza</label>
                  <textarea
                    value={companySettings.invoiceComment}
                    onChange={(e) => setCompanySettings({ ...companySettings, invoiceComment: e.target.value })}
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Np. Dziękujemy za zakupy! Towar pozostaje własnością sprzedawcy do momentu zapłaty."
                  />
                  <p className="mt-1 text-sm text-gray-500">Ten tekst pojawi się na dole każdej faktury.</p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={handleSaveCompany}
                  disabled={companySaving}
                  className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium px-6 py-2 rounded-md transition-colors"
                >
                  {companySaving ? 'Zapisywanie...' : 'Zapisz dane firmy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pricing Settings Tab */}
      {activeTab === 'pricing' && (
        <div className="bg-white rounded-lg shadow p-6 max-w-xl">
          <h2 className="text-lg font-semibold mb-4">Ustawienia cenowe</h2>
          <p className="text-sm text-gray-500 mb-6">
            Te ustawienia wpływają na automatyczne obliczanie cen produktów.
          </p>

          {pricingLoading ? (
            <div className="text-gray-500">Ładowanie...</div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Procent kosztów (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={pricingSettings.costPercentage}
                  onChange={(e) =>
                    setPricingSettings({ ...pricingSettings, costPercentage: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Procent doliczany do ceny zakupu jako koszty operacyjne
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Procent marży (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="0.1"
                  value={pricingSettings.marginPercentage}
                  onChange={(e) =>
                    setPricingSettings({ ...pricingSettings, marginPercentage: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Procent marży doliczany do ceny zakupu + kosztów
                </p>
              </div>

              <div className="border-t pt-4 mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kurs EUR/PLN (do importu)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.01"
                  value={pricingSettings.eurToPlnRate}
                  onChange={(e) =>
                    setPricingSettings({ ...pricingSettings, eurToPlnRate: parseFloat(e.target.value) || 4.30 })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Kurs używany do przeliczania cen EUR na PLN podczas importu z plików Excel.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Przykład kalkulacji:</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Cena zakupu: <span className="font-medium">100 PLN</span></p>
                  <p>+ Koszty ({pricingSettings.costPercentage}%): <span className="font-medium">{(100 * pricingSettings.costPercentage / 100).toFixed(2)} PLN</span></p>
                  <p>= Cena bazowa: <span className="font-medium">{(100 * (1 + pricingSettings.costPercentage / 100)).toFixed(2)} PLN</span></p>
                  <p>+ Marża ({pricingSettings.marginPercentage}%): <span className="font-medium">{(100 * (1 + pricingSettings.costPercentage / 100) * pricingSettings.marginPercentage / 100).toFixed(2)} PLN</span></p>
                  <p className="border-t pt-2 mt-2">
                    <strong>Cena sprzedaży: {(100 * (1 + pricingSettings.costPercentage / 100) * (1 + pricingSettings.marginPercentage / 100)).toFixed(2)} PLN</strong>
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={handleSavePricing}
                  disabled={pricingSaving}
                  className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium px-6 py-2 rounded-md transition-colors"
                >
                  {pricingSaving ? 'Zapisywanie...' : 'Zapisz ustawienia cenowe'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Email Import Settings Tab */}
      {activeTab === 'email-import' && (
        <div className="bg-white rounded-lg shadow p-6 max-w-xl">
          <h2 className="text-lg font-semibold mb-4">Import z email</h2>
          <p className="text-sm text-gray-500 mb-6">
            Konfiguracja automatycznego importu produktów z załączników Excel wysyłanych na email.
          </p>

          {emailLoading ? (
            <div className="text-gray-500">Ładowanie...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-700">Import włączony</p>
                  <p className="text-sm text-gray-500">System będzie automatycznie sprawdzać nowe maile co 10 minut</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailSettings.enabled}
                    onChange={(e) => setEmailSettings({ ...emailSettings, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-3">Dane logowania</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Adres email
                    </label>
                    <input
                      type="email"
                      value={emailSettings.emailAddress}
                      onChange={(e) => setEmailSettings({ ...emailSettings, emailAddress: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="import@firma.pl"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Hasło
                    </label>
                    <input
                      type="password"
                      value={emailSettings.emailPassword}
                      onChange={(e) => setEmailSettings({ ...emailSettings, emailPassword: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="••••••••"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Pozostaw puste jeśli nie chcesz zmieniać hasła
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-3">Serwer poczty przychodzącej (IMAP)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Serwer IMAP
                    </label>
                    <input
                      type="text"
                      value={emailSettings.imapServer}
                      onChange={(e) => setEmailSettings({ ...emailSettings, imapServer: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="imap.firma.pl"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={emailSettings.imapPort}
                      onChange={(e) => setEmailSettings({ ...emailSettings, imapPort: parseInt(e.target.value) || 993 })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-3">Serwer poczty wychodzącej (SMTP)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Serwer SMTP
                    </label>
                    <input
                      type="text"
                      value={emailSettings.smtpServer}
                      onChange={(e) => setEmailSettings({ ...emailSettings, smtpServer: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="smtp.firma.pl"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={emailSettings.smtpPort}
                      onChange={(e) => setEmailSettings({ ...emailSettings, smtpPort: parseInt(e.target.value) || 587 })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zabezpieczenie
                  </label>
                  <select
                    value={emailSettings.smtpSecurity}
                    onChange={(e) => setEmailSettings({ ...emailSettings, smtpSecurity: e.target.value as 'none' | 'ssl' | 'starttls' })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="none">Brak</option>
                    <option value="ssl">SSL/TLS</option>
                    <option value="starttls">STARTTLS</option>
                  </select>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h4 className="text-sm font-medium text-blue-800 mb-2">Jak to działa?</h4>
                <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
                  <li>System sprawdza skrzynkę co 10 minut</li>
                  <li>Szuka nieprzeczytanych wiadomości z załącznikami Excel (.xlsx, .xls)</li>
                  <li>Importuje produkty z załączników do magazynu</li>
                  <li>Jeśli produkt istnieje (po kodzie kreskowym), dodaje palety do stanu</li>
                  <li>Maile są oznaczane jako przeczytane po przetworzeniu</li>
                </ul>
              </div>

              <div className="mt-6 flex gap-4">
                <button
                  onClick={handleSaveEmail}
                  disabled={emailSaving}
                  className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium px-6 py-2 rounded-md transition-colors"
                >
                  {emailSaving ? 'Zapisywanie...' : 'Zapisz ustawienia email'}
                </button>
                <button
                  onClick={handleSync}
                  disabled={syncLoading || !emailSettings.enabled}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium px-6 py-2 rounded-md transition-colors flex items-center gap-2"
                >
                  {syncLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Synchronizacja...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Synchronizuj teraz
                    </>
                  )}
                </button>
              </div>

              {syncResult && (
                <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                  <h4 className="font-medium mb-2">Wynik synchronizacji:</h4>
                  <ul className="text-sm space-y-1">
                    <li>Znalezionych emaili: <span className="font-medium">{syncResult.emailsFound}</span></li>
                    <li>Przetworzonych emaili: <span className="font-medium">{syncResult.emailsProcessed}</span></li>
                    <li>Zaimportowanych produktów: <span className="font-medium text-primary-600">{syncResult.productsImported}</span></li>
                    <li>Zaktualizowanych produktów: <span className="font-medium text-blue-600">{syncResult.productsUpdated}</span></li>
                    {syncResult.productsFailed > 0 && (
                      <li>Nieudanych: <span className="font-medium text-red-600">{syncResult.productsFailed}</span></li>
                    )}
                  </ul>
                  {syncResult.errors.length > 0 && (
                    <div className="mt-2 text-sm text-red-600">
                      <p className="font-medium">Błędy:</p>
                      <ul className="list-disc list-inside">
                        {syncResult.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SMTP Send Settings Tab */}
      {activeTab === 'smtp-send' && (
        <div className="bg-white rounded-lg shadow p-6 max-w-xl">
          <h2 className="text-lg font-semibold mb-4">Wysyłka email (SMTP)</h2>
          <p className="text-sm text-gray-500 mb-6">
            Konfiguracja serwera SMTP do wysyłania wiadomości email z systemu.
          </p>

          {smtpSendLoading ? (
            <div className="text-gray-500">Ładowanie...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serwer SMTP
                  </label>
                  <input
                    type="text"
                    value={smtpSendSettings.smtpHost}
                    onChange={(e) => setSmtpSendSettings({ ...smtpSendSettings, smtpHost: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="smtp.firma.pl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={smtpSendSettings.smtpPort}
                    onChange={(e) => setSmtpSendSettings({ ...smtpSendSettings, smtpPort: parseInt(e.target.value) || 587 })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Zabezpieczenie
                </label>
                <select
                  value={smtpSendSettings.smtpSecurity}
                  onChange={(e) => setSmtpSendSettings({ ...smtpSendSettings, smtpSecurity: e.target.value as 'none' | 'ssl' | 'starttls' })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="none">Brak</option>
                  <option value="ssl">SSL/TLS</option>
                  <option value="starttls">STARTTLS</option>
                </select>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-3">Dane logowania</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Użytkownik (login)
                    </label>
                    <input
                      type="text"
                      value={smtpSendSettings.smtpUser}
                      onChange={(e) => setSmtpSendSettings({ ...smtpSendSettings, smtpUser: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="user@firma.pl"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Hasło
                    </label>
                    <input
                      type="password"
                      value={smtpSendSettings.smtpPassword}
                      onChange={(e) => setSmtpSendSettings({ ...smtpSendSettings, smtpPassword: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="••••••••"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Pozostaw bez zmian jeśli nie chcesz zmieniać hasła
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-3">Nadawca</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adres nadawcy (From)
                  </label>
                  <input
                    type="email"
                    value={smtpSendSettings.smtpFrom}
                    onChange={(e) => setSmtpSendSettings({ ...smtpSendSettings, smtpFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="noreply@firma.pl"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Adres email widoczny jako nadawca wiadomości
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={handleSaveSmtpSend}
                  disabled={smtpSendSaving}
                  className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium px-6 py-2 rounded-md transition-colors"
                >
                  {smtpSendSaving ? 'Zapisywanie...' : 'Zapisz ustawienia SMTP'}
                </button>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-3">Test wysyłki</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Wyślij testowy email aby sprawdzić poprawność konfiguracji. Najpierw zapisz ustawienia powyżej.
                </p>
                <div className="flex gap-3">
                  <input
                    type="email"
                    value={smtpTestEmail}
                    onChange={(e) => setSmtpTestEmail(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="test@example.com"
                  />
                  <button
                    onClick={handleTestSmtpSend}
                    disabled={smtpTesting || !smtpTestEmail}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium px-4 py-2 rounded-md transition-colors whitespace-nowrap"
                  >
                    {smtpTesting ? 'Wysyłanie...' : 'Wyślij test'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Zarządzanie użytkownikami</h2>
            <button
              onClick={() => setShowCreateUserModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              + Dodaj użytkownika
            </button>
          </div>

          {usersLoading ? (
            <div className="text-gray-500">Ładowanie...</div>
          ) : (
            <>
              {/* Employees Table */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Imię</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nazwisko</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Login</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rola</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data utworzenia</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.filter(u => u.role !== UserRole.CUSTOMER).map((user) => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{(user as any).firstName || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{(user as any).lastName || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{(user as any).login || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{user.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                              {getRoleLabel(user.role)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.isActive ? 'Aktywny' : 'Nieaktywny'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(user.createdAt).toLocaleDateString('pl-PL')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button onClick={() => setEditingUser(user)} className="text-blue-600 hover:text-blue-900 mr-3">Edytuj</button>
                            <button onClick={() => setChangingPasswordUser(user)} className="text-indigo-600 hover:text-indigo-900 mr-3">Hasło</button>
                            <button onClick={() => handleToggleUserActive(user.id)} className="text-yellow-600 hover:text-yellow-900 mr-3">
                              {user.isActive ? 'Dezaktywuj' : 'Aktywuj'}
                            </button>
                            <button onClick={() => handleDeleteUser(user.id, user.email)} className="text-red-600 hover:text-red-900 mr-3">Usuń</button>
                            <button onClick={() => handlePermanentDelete(user.id, user.email)} className="text-red-800 hover:text-red-900 font-semibold">Usuń trwale</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {users.filter(u => u.role !== UserRole.CUSTOMER).length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-gray-500">Brak pracowników</p>
                    </div>
                  )}
                </div>
            </>
          )}
        </div>
      )}

      {/* Login History Tab */}
      {activeTab === 'login-history' && (
        <LoginHistoryTab />
      )}

      {/* Price Groups Tab */}
      {activeTab === 'price-groups' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Grupy cenowe</h2>
            <button
              onClick={() => setShowCreatePriceGroupModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              + Dodaj grupę cenową
            </button>
          </div>

          {priceGroupsLoading ? (
            <div className="text-gray-500">Ładowanie...</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nazwa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rabat</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opis</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Liczba klientów</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data utworzenia</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {priceGroups.map((priceGroup) => (
                    <tr key={priceGroup.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{priceGroup.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {priceGroup.discountPercentage}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500 max-w-xs truncate">{priceGroup.description || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {priceGroup.customerCount && priceGroup.customerCount > 0 ? (
                          <button onClick={() => handleViewCustomers(priceGroup)} className="text-sm text-blue-600 hover:text-blue-900">
                            {priceGroup.customerCount} {priceGroup.customerCount === 1 ? 'klient' : 'klientów'}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-500">0 klientów</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(priceGroup.createdAt).toLocaleDateString('pl-PL')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => setEditingPriceGroup(priceGroup)} className="text-blue-600 hover:text-blue-900 mr-3">Edytuj</button>
                        {priceGroup.id !== 1 && (
                          <button
                            onClick={() => handleDeletePriceGroup(priceGroup)}
                            className="text-red-600 hover:text-red-900"
                            disabled={(priceGroup.customerCount || 0) > 0}
                          >
                            Usuń
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {priceGroups.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-500">Brak grup cenowych</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateUserModal && (
        <CreateUserModal onClose={() => setShowCreateUserModal(false)} onCreate={handleCreateUser} />
      )}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onUpdate={handleUpdateUser} />
      )}
      {changingPasswordUser && (
        <ChangePasswordModal user={changingPasswordUser} onClose={() => setChangingPasswordUser(null)} onChangePassword={handleChangePassword} />
      )}
      {showCreatePriceGroupModal && (
        <CreatePriceGroupModal onClose={() => setShowCreatePriceGroupModal(false)} onCreate={handleCreatePriceGroup} />
      )}
      {editingPriceGroup && (
        <EditPriceGroupModal priceGroup={editingPriceGroup} onClose={() => setEditingPriceGroup(null)} onUpdate={handleUpdatePriceGroup} />
      )}

      {/* Customers viewing modal */}

      {/* Printers Tab */}
      {activeTab === "printers" && (
        <div className="space-y-6">
          <PrinterSettingsTab />
        </div>
      )}

      {activeTab === 'grower-passports' && (
        <GrowerPassportsTab />
      )}

      {activeTab === 'tags' && (
        <TagsTab />
      )}

      {activeTab === 'profiles' && (
        <div className="bg-white rounded-lg shadow p-6">
          <PermissionProfilesTab />
        </div>
      )}

      {/* KSeF Tab */}
      {activeTab === 'ksef' && <KsefSettingsTab />}

      {activeTab === 'website' && (
        <WebsiteSettingsTab />
      )}

      {viewingCustomers && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Klienci w grupie: {viewingCustomers.priceGroup.name}
              </h2>
              <button onClick={() => setViewingCustomers(null)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {viewingCustomers.customers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Brak klientów w tej grupie</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nazwa</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Telefon</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {viewingCustomers.customers.map((customer) => (
                      <tr key={customer.id}>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {customer.companyName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim()}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">{customer.email}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{customer.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button onClick={() => setViewingCustomers(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

