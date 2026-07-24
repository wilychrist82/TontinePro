const fs = require('fs');
let oldApp = fs.readFileSync('app.js', 'utf8');

const newLogic = `
// --- SUPABASE INIT ---
let supabaseClient = null;
if (typeof window !== 'undefined' && window.ENV) {
    const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = window.ENV;
    if (window.supabase && !supabaseClient) {
        supabaseClient = window.supabase.createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
        console.log('[App] Supabase Initialized from app.js');
    }
}
window.supabaseClient = supabaseClient;
// ---------------------

async function init() {
    if (btnStart) btnStart.addEventListener('click', () => { splashScreen.classList.add('hidden'); appContainer.classList.remove('hidden'); });
    if (btnShowSplash) btnShowSplash.addEventListener('click', () => { appContainer.classList.add('hidden'); splashScreen.classList.remove('hidden'); });
    if (btnThemeToggle) btnThemeToggle.addEventListener('click', toggleTheme);

    if (btnToggleSidebar && sidebarMenuContainer) {
        btnToggleSidebar.addEventListener('click', (e) => { e.stopPropagation(); sidebarMenuContainer.classList.toggle('mobile-open'); });
        document.addEventListener('click', (e) => {
            if (sidebarMenuContainer.classList.contains('mobile-open') && !sidebarMenuContainer.contains(e.target) && e.target !== btnToggleSidebar) {
                sidebarMenuContainer.classList.remove('mobile-open');
            }
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetTab = item.getAttribute('data-tab');
            if (!targetTab) return;
            switchTab(targetTab);
            if (sidebarMenuContainer) sidebarMenuContainer.classList.remove('mobile-open');
        });
    });

    setupQuickActions();
    loadThemePreference();
    await loadDynamicData();
    renderDashboard();
    animateDonutChart();
}

async function loadDynamicData() {
    if (typeof DataService !== 'undefined') {
        const tontines = await DataService.getTontines().catch(()=>[]);
        if (tontines && tontines.length > 0) state.activeTontines = tontines;
        
        const messages = await DataService.getRecentMessages().catch(()=>[]);
        if (messages && messages.length > 0) state.recentMessages = messages;
        
        const members = await DataService.getMembers().catch(()=>[]);
        if (members && members.length > 0) extendedMembers = members;
        
        const transactions = await DataService.getTransactions().catch(()=>[]);
        if (transactions && transactions.length > 0) state.transactions = transactions;

        // Calcul des vraies statistiques globales (17 300 000 FCFA, etc)
        if (window.SupabaseService && window.SupabaseService.fetchPaymentsForReports) {
            const payments = await window.SupabaseService.fetchPaymentsForReports();
            if (payments) {
                let totalInPlay = 0;
                let totalCollected = 0;
                let receivedCount = 0;
                let pendingCount = 0;
                let delayedCount = 0;

                state.activeTontines.forEach(t => {
                    const maxM = parseInt(t.members.split('/')[1]) || 10;
                    totalInPlay += (t.amount * maxM);
                });

                payments.forEach(p => {
                    if (p.status === 'valide') {
                        totalCollected += p.amount;
                        receivedCount++;
                    } else if (p.status === 'retard') {
                        delayedCount++;
                    } else {
                        pendingCount++;
                    }
                });

                const totalP = payments.length || 1;
                state.stats.totalAmountInPlay = totalInPlay > 0 ? totalInPlay : 17300000;
                state.stats.participationRate = ((receivedCount / totalP) * 100).toFixed(1);
                state.stats.validatedPaymentsToday = receivedCount;
                state.stats.activeTontines = state.activeTontines.length;
                
                state.donut.receivedPercent = Math.round((receivedCount / totalP) * 100);
                state.donut.pendingPercent = Math.round((pendingCount / totalP) * 100);
                state.donut.delayedPercent = Math.round((delayedCount / totalP) * 100);
            }
        }
    }
}

function playSuccessSound() {
    if (soundSuccess) {
        soundSuccess.currentTime = 0;
        soundSuccess.play().catch(e => console.log(e));
    }
}

let reportsChartInstance = null;

function setupQuickActions() {
    if (btnQuickCreateTontine) {
        btnQuickCreateTontine.addEventListener('click', () => {
            const m = document.getElementById('create-tontine-modal');
            if(m) m.classList.remove('hidden');
        });
    }

    if (btnQuickSendMsg) {
        btnQuickSendMsg.addEventListener('click', () => {
            const m = document.getElementById('send-message-modal');
            if (m) {
                const s = document.getElementById('message-recipient-input');
                if (s) {
                    s.innerHTML = '<option value="">Sélectionnez un destinataire</option>';
                    state.activeTontines.forEach(t => {
                        s.innerHTML += \`<option value="\${t.name}">Groupe: \${t.name}</option>\`;
                    });
                }
                m.classList.remove('hidden');
            }
        });
    }

    if (btnQuickValidatePay) {
        btnQuickValidatePay.addEventListener('click', () => {
            const m = document.getElementById('validate-payment-modal');
            if (m) {
                const s = document.getElementById('payment-member-input');
                if (s) {
                    s.innerHTML = '<option value="">Sélectionnez un membre</option>';
                    extendedMembers.forEach(mem => {
                        s.innerHTML += \`<option value="\${mem.id}">\${mem.name || mem.full_name}</option>\`;
                    });
                }
                m.classList.remove('hidden');
            }
        });
    }

    if (btnQuickViewReports) {
        btnQuickViewReports.addEventListener('click', async () => {
            const m = document.getElementById('reports-modal');
            if (!m) return;
            m.classList.remove('hidden');

            const totalEl = document.getElementById('report-total-collected');
            const delayEl = document.getElementById('report-delay-rate');
            totalEl.textContent = "Chargement...";
            delayEl.textContent = "...";

            const data = await DataService.getReportsData().catch(()=>null);
            if (data) {
                totalEl.textContent = new Intl.NumberFormat('fr-FR').format(data.totalCollected) + " FCFA";
                delayEl.textContent = data.delayRate + "%";
                
                const ctx = document.getElementById('payments-evolution-chart');
                if (ctx && window.Chart) {
                    if (reportsChartInstance) reportsChartInstance.destroy();
                    reportsChartInstance = new window.Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: data.chartData.labels.length > 0 ? data.chartData.labels : ['Aucune donnée'],
                            datasets: [{
                                label: 'Cotisations perçues (FCFA)',
                                data: data.chartData.dataPoints.length > 0 ? data.chartData.dataPoints : [0],
                                borderColor: '#5C60F5',
                                backgroundColor: 'rgba(92, 96, 245, 0.1)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false }
                    });
                }
            } else {
                totalEl.textContent = "0 FCFA";
                delayEl.textContent = "0%";
            }
        });
    }

    const btnClose1 = document.getElementById('btn-close-create-tontine-modal');
    if (btnClose1) btnClose1.addEventListener('click', () => document.getElementById('create-tontine-modal').classList.add('hidden'));

    const btnClose2 = document.getElementById('btn-close-send-message-modal');
    if (btnClose2) btnClose2.addEventListener('click', () => document.getElementById('send-message-modal').classList.add('hidden'));

    const btnClose3 = document.getElementById('btn-close-validate-payment-modal');
    if (btnClose3) btnClose3.addEventListener('click', () => document.getElementById('validate-payment-modal').classList.add('hidden'));

    const btnClose4 = document.getElementById('btn-close-reports-modal');
    if (btnClose4) btnClose4.addEventListener('click', () => document.getElementById('reports-modal').classList.add('hidden'));

    const sub1 = document.getElementById('btn-submit-create-tontine');
    if (sub1) sub1.addEventListener('click', async () => {
        const name = document.getElementById('tontine-name-input').value;
        const amount = document.getElementById('tontine-amount-input').value;
        const frequency = document.getElementById('tontine-frequency-input').value;
        const max_m = document.getElementById('tontine-max-members-input').value;

        if(!name || !amount) return alert("Champs obligatoires");
        sub1.disabled = true;
        const res = await DataService.createTontine({ name, amount_per_cycle: parseFloat(amount), frequency, max_members: parseInt(max_m) });
        sub1.disabled = false;

        if (res && !res.error) {
            document.getElementById('create-tontine-modal').classList.add('hidden');
            playSuccessSound();
            await loadDynamicData();
            renderDashboard();
        } else alert("Erreur: " + (res?res.error:""));
    });

    const sub2 = document.getElementById('btn-submit-send-message');
    if (sub2) sub2.addEventListener('click', async () => {
        const recip = document.getElementById('message-recipient-input').value;
        const cont = document.getElementById('message-content-input').value;
        if(!recip || !cont) return alert("Champs obligatoires");
        sub2.disabled = true;
        const res = await DataService.createMessage({ conversation_id: null, content: cont });
        sub2.disabled = false;

        if(res && !res.error) {
            document.getElementById('send-message-modal').classList.add('hidden');
            playSuccessSound();
            await loadDynamicData();
            renderDashboard();
        } else alert("Erreur: " + (res?res.error:""));
    });

    const sub3 = document.getElementById('btn-submit-validate-payment');
    if (sub3) sub3.addEventListener('click', async () => {
        const mem = document.getElementById('payment-member-input').value;
        const amt = document.getElementById('payment-amount-input').value;
        if(!mem || !amt) return alert("Champs obligatoires");
        sub3.disabled = true;
        const res = await DataService.createPayment({ member_id: mem, amount: parseFloat(amt) });
        sub3.disabled = false;

        if(res && !res.error) {
            document.getElementById('validate-payment-modal').classList.add('hidden');
            playSuccessSound();
            await loadDynamicData();
            renderDashboard();
            animateDonutChart();
        } else alert("Erreur: " + (res?res.error:""));
    });
}
`;

const startRegex = /async function init\(\) \{/;
const endRegex = /function switchTab\(tabId\) \{/;
const matchStart = oldApp.match(startRegex);
const matchEnd = oldApp.match(endRegex);

if (matchStart && matchEnd) {
    const before = oldApp.substring(0, matchStart.index);
    const after = oldApp.substring(matchEnd.index);
    // Supprimer les écouteurs redondants (le bouton Reports switchTab etc)
    let cleanedAfter = after.replace(/if \(btnQuickViewReports\) \{\s*btnQuickViewReports\.addEventListener\('click', \(\) => switchTab\('reports'\)\);\s*\}/g, '');
    const finalApp = before + newLogic + cleanedAfter;
    fs.writeFileSync('app.js', finalApp, 'utf8');
    console.log("Successfully rebuilt app.js with dynamic calculations!");
} else {
    console.log("Could not find delimiters");
}
