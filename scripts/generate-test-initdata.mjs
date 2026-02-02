import crypto from 'crypto';

// Данные для теста (замените на свои, если нужно)
const botToken = "6277956560:AAFP_riJxeDi8dpqeVMtVcU_yY9RCkpEOaA"; // Должен совпадать с тем, что в .env.local
const user = {
  id: 12345678,
  first_name: "Иван",
  last_name: "Тестовый",
  username: "test_user",
  language_code: "ru"
};

const authDate = Math.floor(Date.now() / 1000);
const data = {
  user: JSON.stringify(user),
  auth_date: authDate.toString()
};

// Сортируем ключи и создаем строку данных
const dataCheckString = Object.keys(data)
  .sort()
  .map(key => `${key}=${data[key]}`)
  .join('\n');

// Генерируем хэш
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

const initData = new URLSearchParams({ ...data, hash }).toString();

console.log("\nВаша тестовая строка initData:");
console.log("-------------------------------");
console.log(initData);
console.log("-------------------------------\n");