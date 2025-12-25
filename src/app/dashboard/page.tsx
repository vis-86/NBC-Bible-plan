'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { readItems, createItem, deleteItems } from '@directus/sdk';
import { isAuthenticated, getCurrentUser } from '@/lib/auth';
import { directus } from '@/lib/directus';
import { AppView, ReadingPlanDay, BibleReference } from '@/types';
import { parseReading } from '@/lib/utils';
import { isTelegramWebApp, getTelegramUser, initTelegramWebApp, getTelegramInitData } from '@/lib/telegram';
import DashboardLayout from '@/components/DashboardLayout';
import PlanView from '@/components/PlanView';
import ReadingView from '@/components/ReadingView';
import PastorChat from '@/components/PastorChat';
import ReferenceTool from '@/components/ReferenceTool';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: any; first_name: string; email?: string } | null>(null);
  const [currentView, setCurrentView] = useState<AppView>(AppView.PLAN);
  const [plan, setPlan] = useState<ReadingPlanDay[]>([]);
  const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
  const [currentReading, setCurrentReading] = useState<BibleReference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  const fetchData = useCallback(async (userId: any) => {
    try {
      setError(null);
      
      // Ensure userId is in a format compatible with the database (INTEGER)
      // If it's a UUID string from Directus, we might have issues if the DB field is strictly INTEGER.
      // For Telegram users, it's always a number.
      const normalizedUserId = typeof userId === 'number' ? userId : parseInt(userId.toString().replace(/\D/g, '').slice(0, 9)) || 0;

      // Fetch plan
      const planData = await directus.request(readItems('plan', {
        sort: ['numbers'],
        limit: -1
      }));

      // Fetch user's reading progress
      console.log('FETCHING_PROGRESS_FOR_USER_ID:', userId, '(normalized:', normalizedUserId, ')');
      const progressData = await directus.request(readItems('reading', {
        filter: {
          user_id: { _eq: normalizedUserId }
        },
        limit: -1
      }));
      console.log('RECEIVED_PROGRESS_DATA:', progressData);

      const completedDayNumbers = new Set(progressData.map((p: any) => p.day));

      // Map to ReadingPlanDay
      const mappedPlan: ReadingPlanDay[] = planData.map((item: any) => ({
        id: item.numbers,
        dateStr: item.day,
        readings: parseReading(item.read),
        completed: completedDayNumbers.has(item.numbers)
      }));

      setPlan(mappedPlan);

      // Derive read chapters from completed days
      const chapters = new Set<string>();
      mappedPlan.forEach(day => {
        if (day.completed) {
          day.readings.forEach(r => chapters.add(`${r.book}_${r.chapter}`));
        }
      });
      setReadChapters(chapters);

    } catch (error: any) {
      const errorDetail = {
        message: error.message,
        code: error.errors?.[0]?.extensions?.code,
        status: error.response?.status,
        collection: error.errors?.[0]?.extensions?.collection,
      };
      
      console.error('FETCH_DATA_ERROR_DETAIL:', JSON.stringify(errorDetail, null, 2));
      
      let errorMessage = 'Ошибка при загрузке данных.';
      if (errorDetail.code === 'FORBIDDEN') {
        errorMessage = `Доступ запрещен (403). Проверьте права доступа в Directus для коллекции "${errorDetail.collection || 'plan'}". Убедитесь, что роль пользователя имеет права на чтение (Read).`;
      } else if (error.message) {
        errorMessage = `Ошибка: ${error.message}`;
      }
      setError(errorMessage);
    }
  }, []);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const checkAuth = async () => {
      // 1. Try Telegram first
      if (isTelegramWebApp()) {
        console.log('RUNNING_IN_TELEGRAM_MODE');
        initTelegramWebApp();
        const initData = getTelegramInitData();
        
        try {
          // Verify on server
          const verifyRes = await fetch('/api/auth/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData })
          });

          if (verifyRes.ok) {
            const { user: verifiedUser } = await verifyRes.json();
            console.log('TELEGRAM_USER_VERIFIED:', verifiedUser);
            
            const userData = {
              id: verifiedUser.id,
              first_name: verifiedUser.first_name,
              username: verifiedUser.username
            };
            setUser(userData as any);
            await fetchData(verifiedUser.id);
            setLoading(false);
            return;
          } else {
            console.error('Telegram verification failed');
            const errData = await verifyRes.json();
            setError(`Ошибка верификации Telegram: ${errData.error || 'Unknown error'}`);
          }
        } catch (err) {
          console.error('Error verifying Telegram user:', err);
          setError('Ошибка при проверке данных Telegram.');
        }
      }

      // 2. Fallback to Directus Auth
      console.log('FALLBACK_TO_DIRECTUS_AUTH');
      const authenticated = await isAuthenticated();
      
      if (!authenticated) {
        router.push('/login');
        return;
      }

      const userData = await getCurrentUser();
      if (userData) {
        console.log('DIRECTUS_USER_FOUND:', userData);
        setUser({
            id: userData.id,
            first_name: userData.first_name || userData.email,
            email: userData.email
        });
        await fetchData(userData.id);
      }
      setLoading(false);
    };

    checkAuth();
  }, [router, fetchData]);

  const handleSelectReading = (day: ReadingPlanDay, reading: BibleReference) => {
    setCurrentReading(reading);
    setCurrentView(AppView.READER);
  };

  const handleToggleComplete = async (dayId: number) => {
    if (!user) return;

    const day = plan.find(d => d.id === dayId);
    if (!day) return;

    const isCompleted = day.completed;
    const normalizedUserId = typeof user.id === 'number' ? user.id : parseInt(user.id.toString().replace(/\D/g, '').slice(0, 9)) || 0;

    // Оптимистичное обновление локального стейта
    setPlan(prevPlan => prevPlan.map(d => 
      d.id === dayId ? { ...d, completed: !isCompleted } : d
    ));

    // Обновляем прочитанные главы оптимистично
    if (!isCompleted) {
      setReadChapters(prev => {
        const next = new Set(prev);
        day.readings.forEach(r => next.add(`${r.book}_${r.chapter}`));
        return next;
      });
    }

    try {
      if (isCompleted) {
        const records = await directus.request(readItems('reading', {
          filter: {
            _and: [
              { user_id: { _eq: normalizedUserId } },
              { day: { _eq: dayId } }
            ]
          }
        }));
        
        if (records.length > 0) {
            const recordIds = records.map((r: any) => r.id);
            await directus.request(deleteItems('reading', recordIds));
        }
      } else {
        await directus.request(createItem('reading', {
          user_id: normalizedUserId,
          day: dayId
        }));
      }

      // Окончательная синхронизация с сервером
      await fetchData(user.id);
    } catch (error: any) {
      console.error('Error toggling completion:', error);
      await fetchData(user.id);
    }
  };

  const handleToggleChapter = (book: string, chapter: number) => {
    // For now, we don't have a table for individual chapters.
    // We'll just update the local state for immediate feedback.
    const key = `${book}_${chapter}`;
    setReadChapters(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="text-stone-600">Загрузка...</div>
      </div>
    );
  }

  const renderContent = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center h-full">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
            <h3 className="text-red-800 font-bold mb-2">Ошибка загрузки</h3>
            <p className="text-red-600 mb-4">{error}</p>
            <button 
              onClick={() => user && fetchData(user.id)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }

    switch (currentView) {
      case AppView.PLAN:
        return (
          <PlanView 
            plan={plan} 
            readChapters={readChapters}
            onSelectReading={handleSelectReading}
            onToggleComplete={handleToggleComplete}
            onToggleChapter={handleToggleChapter}
            userName={user?.first_name || user?.email}
          />
        );
      case AppView.READER:
        return (
          <ReadingView 
            reading={currentReading} 
            onBack={() => setCurrentView(AppView.PLAN)}
          />
        );
      case AppView.CHAT:
        return <PastorChat />;
      case AppView.REFERENCE:
        return <ReferenceTool />;
      default:
        return null;
    }
  };

  return (
    <DashboardLayout currentView={currentView} onChangeView={setCurrentView}>
      {renderContent()}
    </DashboardLayout>
  );
}
