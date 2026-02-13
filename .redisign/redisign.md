The code below contains a design. This design should be used to create a new app or be added to an existing one.

Look at the current open project to determine if a project exists. If no project is open, create a new Vite project then create this view in React after componentizing it.

If a project does exist, determine the framework being used and implement the design within that framework. Identify whether reusable components already exist that can be used to implement the design faithfully and if so use them, otherwise create new components. If other views already exist in the project, make sure to place the view in a sensible route and connect it to the other views.

Ensure the visual characteristics, layout, and interactions in the design are preserved with perfect fidelity.

Run the dev command so the user can see the app once finished.

```
<html lang="en" vid="0"><head vid="1">
    <meta charset="UTF-8" vid="2">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" vid="3">
    <title vid="4">Bible Reading Plan</title>
    <style vid="5">
        :root {
            --bg-base: #d6d6d6;
            --text-primary: #1a1a1a;
            --text-secondary: #555555;
            --accent-hot: #ff2a3c;
            --accent-warm: #ff5e6c;
            --font-main: 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
            --space-unit: 1rem;
            --nav-height: 80px;
        }

        * {
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            margin: 0;
            padding: 0;
            background-color: var(--bg-base);
            font-family: var(--font-main);
            color: var(--text-primary);
            min-height: 100vh;
            overflow-x: hidden;
            position: relative;
        }

        
        .ambient-gradient {
            position: fixed;
            bottom: -20vh;
            left: 0;
            width: 100%;
            height: 80vh;
            background: radial-gradient(circle at 50% 100%, var(--accent-hot) 0%, rgba(255, 94, 108, 0.8) 30%, rgba(214, 214, 214, 0) 70%);
            z-index: -1;
            pointer-events: none;
            filter: blur(40px);
        }

        
        h1, h2, h3, p, a {
            margin: 0;
        }

        .swiss-headline {
            font-size: 3.5rem;
            line-height: 0.9;
            font-weight: 500;
            letter-spacing: -0.04em;
            text-transform: uppercase;
            color: var(--text-primary);
        }

        .swiss-sub {
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-primary);
        }

        .swiss-label {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            color: var(--text-secondary);
        }

        
        .app-container {
            padding: 2rem 1.5rem 120px 1.5rem;
            max-width: 600px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 3rem;
        }

        
        header {
            padding-top: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .date-display {
            text-align: right;
            font-size: 0.9rem;
            font-weight: 500;
        }

        
        .section-block {
            position: relative;
            display: flex;
            gap: 1.5rem;
        }

        .section-marker {
            width: 1.5rem;
            flex-shrink: 0;
            display: flex;
            align-items: flex-end; 
            justify-content: center;
            border-left: 1px solid rgba(0,0,0,0.1);
        }

        .content-area {
            flex-grow: 1;
        }

        
        .watermark-number {
            position: absolute;
            right: -1rem;
            top: -2rem;
            font-size: 12rem;
            line-height: 1;
            font-weight: 400;
            color: var(--text-primary);
            opacity: 0.06;
            pointer-events: none;
            z-index: 0;
            letter-spacing: -0.08em;
        }

        .chapter-link-large {
            display: block;
            font-size: 2rem;
            line-height: 1;
            font-weight: 400;
            text-transform: uppercase;
            text-decoration: none;
            color: var(--text-primary);
            margin-bottom: 0.5rem;
            letter-spacing: -0.02em;
            position: relative;
            z-index: 1;
            transition: opacity 0.2s;
        }

        .chapter-link-large:active {
            opacity: 0.6;
        }

        .chapter-meta {
            font-size: 0.8rem;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 2rem;
            display: block;
        }

        
        .week-grid {
            display: flex;
            flex-direction: column;
            border-top: 1px solid var(--text-primary);
        }

        .week-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 0;
            border-bottom: 1px solid rgba(0,0,0,0.1);
            text-decoration: none;
            color: var(--text-primary);
            transition: padding-left 0.2s;
        }

        .week-row:active {
            padding-left: 0.5rem;
            background-color: rgba(255,255,255,0.1);
        }

        .day-label {
            font-size: 0.9rem;
            text-transform: uppercase;
            font-weight: 600;
            width: 30%;
        }

        .reading-ref {
            font-size: 0.9rem;
            text-transform: uppercase;
            font-weight: 400;
            text-align: right;
            flex-grow: 1;
        }

        .status-indicator {
            width: 12px;
            height: 12px;
            border: 1px solid var(--text-primary);
            border-radius: 50%;
            margin-left: 1rem;
            position: relative;
        }

        .status-indicator.checked::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 6px;
            height: 6px;
            background-color: var(--text-primary);
            border-radius: 50%;
        }

        
        .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: var(--nav-height);
            display: flex;
            justify-content: space-around;
            align-items: center;
            background: linear-gradient(to top, rgba(255, 42, 60, 0.1) 0%, rgba(255,255,255,0) 100%);
            backdrop-filter: blur(4px);
            z-index: 100;
            padding-bottom: env(safe-area-inset-bottom);
        }

        .nav-item {
            text-decoration: none;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 0.1em;
            color: var(--text-primary);
            font-weight: 600;
            opacity: 0.5;
            transition: opacity 0.2s;
            position: relative;
            padding: 10px;
        }

        .nav-item.active {
            opacity: 1;
        }

        .nav-item.active::after {
            content: '—';
            display: block;
            text-align: center;
            position: absolute;
            bottom: -5px;
            width: 100%;
            left: 0;
        }

        
        .separator {
            width: 20px;
            height: 1px;
            background-color: var(--text-primary);
            margin: 1rem 0;
        }

    </style>
</head>
<body vid="6">

    
    <div class="ambient-gradient" vid="7"></div>

    <div class="app-container" vid="8">
        
        
        <header vid="9">
            <div vid="10">
                <div class="swiss-sub" vid="11">Welcome back</div>
                <h1 class="swiss-headline" vid="12">Good<br vid="13">Morning</h1>
            </div>
            <div class="date-display" vid="14">
                24 OCT<br vid="15">2023
            </div>
        </header>

        
        <div class="section-block" vid="16">
            <div class="section-marker" vid="17">
                <span class="swiss-label" vid="18">TODAY — 24.10</span>
            </div>
            <div class="content-area" vid="19">
                <div class="watermark-number" vid="20">24</div>
                
                <div style="margin-top: 2rem;" vid="21">
                    <span class="chapter-meta" vid="22">Morning Reading</span>
                    <a href="#" class="chapter-link-large" vid="23">Genesis 12</a>
                    <div class="separator" vid="24"></div>
                    
                    <span class="chapter-meta" vid="25">Evening Reading</span>
                    <a href="#" class="chapter-link-large" vid="26">Matthew 8</a>
                </div>
            </div>
        </div>

        
        <div class="section-block" vid="27">
            <div class="section-marker" vid="28">
                <span class="swiss-label" vid="29">WEEK 42 — OVERVIEW</span>
            </div>
            <div class="content-area" vid="30">
                <div class="swiss-sub" style="margin-bottom: 1rem;" vid="31">This Week's Plan</div>
                
                <div class="week-grid" vid="32">
                    <a href="#" class="week-row" vid="33">
                        <span class="day-label" vid="34">Mon</span>
                        <span class="reading-ref" vid="35">Gen 12 — Matt 8</span>
                        <div class="status-indicator checked" vid="36"></div>
                    </a>
                    <a href="#" class="week-row" vid="37">
                        <span class="day-label" vid="38">Tue</span>
                        <span class="reading-ref" vid="39">Gen 13 — Matt 9</span>
                        <div class="status-indicator" vid="40"></div>
                    </a>
                    <a href="#" class="week-row" vid="41">
                        <span class="day-label" vid="42">Wed</span>
                        <span class="reading-ref" vid="43">Gen 14 — Matt 10</span>
                        <div class="status-indicator" vid="44"></div>
                    </a>
                    <a href="#" class="week-row" vid="45">
                        <span class="day-label" vid="46">Thu</span>
                        <span class="reading-ref" vid="47">Gen 15 — Matt 11</span>
                        <div class="status-indicator" vid="48"></div>
                    </a>
                    <a href="#" class="week-row" vid="49">
                        <span class="day-label" vid="50">Fri</span>
                        <span class="reading-ref" vid="51">Gen 16 — Matt 12</span>
                        <div class="status-indicator" vid="52"></div>
                    </a>
                </div>
            </div>
        </div>

    </div>

    
    <nav class="bottom-nav" vid="53">
        <a href="#" class="nav-item active" vid="54">Home</a>
        <a href="#" class="nav-item" vid="55">Bible</a>
        <a href="#" class="nav-item" vid="56">Settings</a>
    </nav>


</body></html>
```
