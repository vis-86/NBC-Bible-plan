The code below contains a design. This design should be used to create a new app or be added to an existing one.

Look at the current open project to determine if a project exists. If no project is open, create a new Vite project then create this view in React after componentizing it.

If a project does exist, determine the framework being used and implement the design within that framework. Identify whether reusable components already exist that can be used to implement the design faithfully and if so use them, otherwise create new components. If other views already exist in the project, make sure to place the view in a sensible route and connect it to the other views.

Ensure the visual characteristics, layout, and interactions in the design are preserved with perfect fidelity.

Run the dev command so the user can see the app once finished.

```
<html lang="ru" vid="0"><head vid="1">
    <meta charset="UTF-8" vid="2">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" vid="3">
    <title vid="4">Bible Reading App Variation</title>
    <script src="https://cdn.tailwindcss.com/3.4.17" vid="5"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&amp;family=Lora:ital,wght@0,400;0,500;0,600;1,400&amp;display=swap" rel="stylesheet" vid="6">
    <style vid="7">
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #FAFAF9; 
        }
        .font-serif {
            font-family: 'Lora', serif;
        }
        .hide-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        .glass-panel {
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .glass-nav {
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            box-shadow: 0 -4px 20px rgba(0,0,0,0.02);
        }
    </style>
</head>
<body class="text-stone-800 min-h-screen relative pb-32" vid="8">

    
    <header class="px-6 pt-10 pb-2 flex justify-between items-end" vid="9">
        <div vid="10">
            <div class="flex items-center gap-2 mb-1" vid="11">
                <div class="w-8 h-8 rounded-full bg-stone-200 overflow-hidden border border-stone-300" vid="12">
                    
                    
                </div>
                <p class="text-xs font-semibold text-stone-500 uppercase tracking-wide" vid="13">Пятница, 13 Фев.</p>
            </div>
            <h1 class="text-3xl font-serif font-medium text-stone-900 leading-tight" vid="14">Доброй ночи,<br vid="15"><span class="text-stone-400" vid="16">Igor</span></h1>
        </div>
        
        
        <div class="flex flex-col items-end" vid="17">
            <div class="flex items-center gap-1.5 bg-white pl-2 pr-3 py-1.5 rounded-full shadow-sm border border-stone-100 mb-1" vid="18">
                <div class="p-1 bg-orange-100 rounded-full" vid="19">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-orange-500" vid="20">
                        <path fill-rule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.177A7.547 7.547 0 016.648 6.61a.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" vid="21"></path>
                    </svg>
                </div>
                <span class="text-base font-bold text-stone-800" vid="22">39</span>
            </div>
            <span class="text-[10px] font-medium text-stone-400" vid="23">Дней подряд</span>
        </div>
    </header>

    
    <section class="mt-6 mb-8 pl-6" vid="24">
        <div class="flex overflow-x-auto gap-4 hide-scrollbar pr-6 pb-2 items-end h-[90px]" vid="25">
            
            
            <div class="flex flex-col items-center gap-2 group cursor-pointer min-w-[52px]" vid="26">
                <span class="text-[10px] font-bold text-stone-400 uppercase" vid="27">10</span>
                <div class="w-[52px] h-[52px] rounded-full border border-stone-200 bg-white flex items-center justify-center text-stone-400 group-hover:border-stone-300 transition-colors shadow-sm" vid="28">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5 text-emerald-500" vid="29">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" vid="30"></path>
                    </svg>
                </div>
            </div>

            
            <div class="flex flex-col items-center gap-2 group cursor-pointer min-w-[52px]" vid="31">
                <span class="text-[10px] font-bold text-stone-400 uppercase" vid="32">11</span>
                <div class="w-[52px] h-[52px] rounded-full border border-rose-100 bg-rose-50 flex items-center justify-center text-rose-500 shadow-sm relative" vid="33">
                    <span class="font-bold text-lg" vid="34">42</span>
                    <div class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white" vid="35"></div>
                </div>
            </div>

             
             <div class="flex flex-col items-center gap-2 group cursor-pointer min-w-[52px]" vid="36">
                <span class="text-[10px] font-bold text-stone-400 uppercase" vid="37">12</span>
                <div class="w-[52px] h-[52px] rounded-full border border-stone-200 bg-white flex items-center justify-center text-stone-600 shadow-sm" vid="38">
                    <span class="font-bold text-lg" vid="39">43</span>
                </div>
            </div>

            
            <div class="flex flex-col items-center gap-3 cursor-pointer min-w-[64px]" vid="40">
                <span class="text-xs font-bold text-indigo-600 uppercase tracking-widest" vid="41">Сегодня</span>
                <div class="w-[64px] h-[72px] rounded-2xl bg-indigo-600 text-white flex flex-col items-center justify-center shadow-lg shadow-indigo-200 relative overflow-hidden" vid="42">
                    <div class="absolute top-0 right-0 w-8 h-8 bg-white/10 rounded-bl-2xl" vid="43"></div>
                    <span class="text-2xl font-bold leading-none" vid="44">44</span>
                    <span class="text-[10px] font-medium opacity-80 mt-1" vid="45">Пт</span>
                </div>
            </div>

            
            <div class="flex flex-col items-center gap-2 group cursor-pointer min-w-[52px]" vid="46">
                <span class="text-[10px] font-bold text-stone-400 uppercase" vid="47">14</span>
                <div class="w-[52px] h-[52px] rounded-full border border-stone-200 bg-white flex items-center justify-center text-stone-400 shadow-sm" vid="48">
                    <span class="font-bold text-lg" vid="49">45</span>
                </div>
            </div>

             
             <div class="flex flex-col items-center gap-2 group cursor-pointer min-w-[52px]" vid="50">
                <span class="text-[10px] font-bold text-stone-400 uppercase" vid="51">15</span>
                <div class="w-[52px] h-[52px] rounded-full border border-stone-200 bg-white flex items-center justify-center text-stone-400 shadow-sm" vid="52">
                    <span class="font-bold text-lg" vid="53">46</span>
                </div>
            </div>
        </div>
    </section>

    
    <section class="px-4 mb-6" vid="54">
        <div class="bg-[#1E293B] rounded-[32px] p-1 shadow-xl shadow-slate-200 relative overflow-hidden" vid="55">
            
            <div class="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16" vid="56"></div>
            <div class="absolute bottom-0 left-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl -ml-10 -mb-10" vid="57"></div>
            
            <div class="relative bg-slate-800/50 backdrop-blur-sm rounded-[28px] p-6 border border-white/5" vid="58">
                <div class="flex justify-between items-start mb-6" vid="59">
                    <div vid="60">
                        <div class="flex items-center gap-2 mb-2" vid="61">
                            <span class="px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider" vid="62">План 2026</span>
                            <span class="text-slate-400 text-xs" vid="63">День 44 из 365</span>
                        </div>
                        <h2 class="text-2xl font-bold text-white mb-1" vid="64">Чтение на сегодня</h2>
                        <p class="text-slate-400 text-sm" vid="65">Примерное время: 8 мин</p>
                    </div>
                    
                    
                    <div class="relative w-12 h-12 flex items-center justify-center" vid="66">
                        <svg class="w-full h-full transform -rotate-90" vid="67">
                            <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3" fill="none" class="text-slate-700" vid="68"></circle>
                            <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="125.6" stroke-dashoffset="115" stroke-linecap="round" class="text-emerald-400" vid="69"></circle>
                        </svg>
                        <span class="absolute text-[10px] font-bold text-white" vid="70">8%</span>
                    </div>
                </div>

                
                <div class="space-y-3 mb-6" vid="71">
                    <label class="flex items-center p-3 rounded-xl bg-slate-700/30 border border-slate-600/30 cursor-pointer hover:bg-slate-700/50 transition-all group" vid="72">
                        <div class="relative flex items-center justify-center w-6 h-6 mr-4" vid="73">
                            <input type="checkbox" class="peer appearance-none w-6 h-6 rounded-full border-2 border-slate-500 checked:bg-emerald-500 checked:border-emerald-500 transition-colors" vid="74">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-3.5 h-3.5 text-white absolute opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" vid="75">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" vid="76"></path>
                            </svg>
                        </div>
                        <div class="flex-1" vid="77">
                            <span class="text-lg font-medium text-slate-200 group-hover:text-white transition-colors" vid="78">Исход 4</span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-slate-500 group-hover:text-slate-300" vid="79">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" vid="80"></path>
                        </svg>
                    </label>

                    <label class="flex items-center p-3 rounded-xl bg-slate-700/30 border border-slate-600/30 cursor-pointer hover:bg-slate-700/50 transition-all group" vid="81">
                        <div class="relative flex items-center justify-center w-6 h-6 mr-4" vid="82">
                            <input type="checkbox" class="peer appearance-none w-6 h-6 rounded-full border-2 border-slate-500 checked:bg-emerald-500 checked:border-emerald-500 transition-colors" vid="83">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-3.5 h-3.5 text-white absolute opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" vid="84">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" vid="85"></path>
                            </svg>
                        </div>
                        <div class="flex-1" vid="86">
                            <span class="text-lg font-medium text-slate-200 group-hover:text-white transition-colors" vid="87">Исход 5</span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-slate-500 group-hover:text-slate-300" vid="88">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" vid="89"></path>
                        </svg>
                    </label>
                </div>

                <button class="w-full py-3.5 bg-white text-slate-900 font-bold rounded-xl shadow-lg hover:bg-slate-50 active:scale-[0.99] transition-all flex items-center justify-center gap-2" vid="90">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" vid="91">
                        <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" vid="92"></path>
                    </svg>
                    Начать чтение
                </button>
            </div>
        </div>
    </section>

    
    <section class="px-4 mb-6 grid grid-cols-1 gap-4" vid="93">
        
        
        <div class="bg-white p-5 rounded-3xl border border-stone-100 shadow-sm" vid="94">
            <div class="flex items-center gap-4 mb-4" vid="95">
                <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 flex-shrink-0" vid="96">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6" vid="97">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" vid="98"></path>
                    </svg>
                </div>
                <div class="flex-1" vid="99">
                    <h3 class="text-sm font-bold text-stone-900" vid="100">Недельное чтение</h3>
                    <p class="text-xs text-stone-500 mt-0.5" vid="101">Притчи 9-12 • <span class="text-indigo-600 font-medium" vid="102">09.02 – 15.02</span></p>
                </div>
            </div>
            
            <div class="space-y-2" vid="103">
                <a href="#" class="flex items-center justify-between p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors group" vid="104">
                    <span class="text-sm font-medium text-stone-700 group-hover:text-stone-900" vid="105">Притчи 9</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-stone-400 group-hover:text-stone-600" vid="106">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" vid="107"></path>
                    </svg>
                </a>
                <a href="#" class="flex items-center justify-between p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors group" vid="108">
                    <span class="text-sm font-medium text-stone-700 group-hover:text-stone-900" vid="109">Притчи 10</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-stone-400 group-hover:text-stone-600" vid="110">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" vid="111"></path>
                    </svg>
                </a>
                <a href="#" class="flex items-center justify-between p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors group" vid="112">
                    <span class="text-sm font-medium text-stone-700 group-hover:text-stone-900" vid="113">Притчи 11</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-stone-400 group-hover:text-stone-600" vid="114">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" vid="115"></path>
                    </svg>
                </a>
                <a href="#" class="flex items-center justify-between p-3 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors group" vid="116">
                    <span class="text-sm font-medium text-stone-700 group-hover:text-stone-900" vid="117">Притчи 12</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-stone-400 group-hover:text-stone-600" vid="118">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" vid="119"></path>
                    </svg>
                </a>
            </div>
        </div>

        
        <div class="relative bg-[#F5F5F4] rounded-3xl p-6 border border-stone-200/50 overflow-hidden" vid="120">
             
             <div class="absolute -top-2 -left-2 text-stone-200 opacity-50" vid="121">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-16 h-16" vid="122">
                    <path fill-rule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clip-rule="evenodd" vid="123"></path>
                </svg>
            </div>

            <div class="relative z-10 text-center" vid="124">
                <p class="font-serif text-stone-700 italic text-lg leading-relaxed mb-4" vid="125">
                    "Все Писание богодухновенно и полезно для научения, для обличения, для исправления..."
                </p>
                <div class="inline-block px-3 py-1 bg-stone-200/50 rounded-full text-[10px] font-bold text-stone-500 uppercase tracking-widest" vid="126">
                    2 Тим 3:16
                </div>
            </div>
        </div>
    </section>

    
    <nav class="fixed bottom-6 left-4 right-4 h-[72px] glass-nav rounded-[24px] flex items-center justify-around px-2 z-50 border border-white/50 shadow-2xl shadow-stone-200/50" vid="127">
        
        <a href="#" class="flex flex-col items-center gap-1 p-2 w-16 relative group" vid="128">
            <span class="absolute -top-3 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-600 rounded-full opacity-100" vid="129"></span>
            <div class="text-indigo-600 transition-transform group-active:scale-90" vid="130">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6" vid="131">
                    <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" vid="132"></path>
                    <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" vid="133"></path>
                </svg>
            </div>
            <span class="text-[10px] font-bold text-indigo-600" vid="134">Главная</span>
        </a>

        <a href="#" class="flex flex-col items-center gap-1 p-2 w-16 group" vid="135">
            <span class="absolute -top-3 left-1/2 -translate-x-1/2 w-1 h-1 bg-stone-400 rounded-full opacity-0 transition-opacity" vid="136"></span>
            <div class="text-stone-400 group-hover:text-stone-600 transition-colors group-active:scale-90" vid="137">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6" vid="138">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" vid="139"></path>
                </svg>
            </div>
            <span class="text-[10px] font-medium text-stone-400 group-hover:text-stone-600" vid="140">Библия</span>
        </a>

        <a href="#" class="flex flex-col items-center gap-1 p-2 w-16 group" vid="141">
            <span class="absolute -top-3 left-1/2 -translate-x-1/2 w-1 h-1 bg-stone-400 rounded-full opacity-0 transition-opacity" vid="142"></span>
            <div class="text-stone-400 group-hover:text-stone-600 transition-colors group-active:scale-90" vid="143">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6" vid="144">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" vid="145"></path>
                </svg>
            </div>
            <span class="text-[10px] font-medium text-stone-400 group-hover:text-stone-600" vid="146">Закладки</span>
        </a>

        <a href="#" class="flex flex-col items-center gap-1 p-2 w-16 group" vid="147">
            <span class="absolute -top-3 left-1/2 -translate-x-1/2 w-1 h-1 bg-stone-400 rounded-full opacity-0 transition-opacity" vid="148"></span>
            <div class="text-stone-400 group-hover:text-stone-600 transition-colors group-active:scale-90" vid="149">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6" vid="150">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.212 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" vid="151"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" vid="152"></path>
                </svg>
            </div>
            <span class="text-[10px] font-medium text-stone-400 group-hover:text-stone-600" vid="153">Профиль</span>
        </a>
    </nav>


</body></html>
```
