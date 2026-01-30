import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionMessage, setSessionMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const reason = localStorage.getItem('logoutReason');
    if (reason === 'session_kicked') {
      setSessionMessage('Sesja została zakończona — zalogowano się na innym urządzeniu.');
      localStorage.removeItem('logoutReason');
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.login(email, password);

      // Check if user has admin panel access (not a customer)
      if (response.user.role === 'customer') {
        setError('Brak dostepu do panelu administracyjnego. Uzyj sklepu internetowego.');
        return;
      }

      localStorage.setItem('token', response.token);
      localStorage.setItem('userRole', response.user.role);
      localStorage.setItem('userPermissions', JSON.stringify(response.permissions || []));
      navigate('/inventory');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd logowania');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <img src="/polflor-logo.png" alt="POLFLOR" className="h-48 mx-auto mb-4" />
          <p className="mt-2 text-sm text-gray-600">
            Panel administracyjny
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {sessionMessage && (
            <div className="bg-yellow-50 border border-yellow-400 text-yellow-800 px-4 py-3 rounded">
              {sessionMessage}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="text"
                required
                className="input rounded-t-md rounded-b-none"
                placeholder="Email lub login"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Hasło
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input rounded-b-md rounded-t-none"
                placeholder="Hasło"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? 'Logowanie...' : 'Zaloguj się'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
