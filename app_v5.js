/* ==========================================
   Tontine Pro - App Controller (Clean Rewrite)
   ========================================== */

// --- 1. SUPABASE ---
// Le client Supabase est géré par supabase.js (chargé avant app.js).
// Utiliser getSupabaseClient() pour obtenir l'instance.

// --- 2. GLOBAL STATE ---
const state = {
    user: {
        name: "Utilisateur",
        role: "Gestionnaire",
        avatar: "https://ui-avatars.com/api/?name=Utilisateur&background=random"
    },
    stats: {
        activeTontines: 0,
        totalAmountInPlay: 0,
        toursInProgress: 0,
        validatedPaymentsToday: 0,
        totalMembers: 0,
        participationRate: 0
    },
    donut: { receivedPercent: 0, pendingPercent: 0, delayedPercent: 0 },
    nextRound: {
        recipientName: "-",
        recipientAvatar: "https://ui-avatars.com/api/?name=NA&background=random",
        role: "Doit recevoir",
        payoutAmount: 0,
        timeBadge: "-",
        tontineName: "-",
        tourCount: "-",
        date: "-",
        isClosed: false
    },
    activeTontines: [],
    recentMessages: [],
    transactions: []
};

let extendedMembers = [];
let reportsChartInstance = null;

// --- 2.5. UTILITAIRES PREMIUM ---
function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function getAvatarInitials(name) {
    if (!name) return 'U';
    const letters = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const colors = ['5C60F5', '10B981', 'F59E0B', 'EF4444', '8B5CF6'];
    const color = colors[name.length % colors.length];
    return `https://ui-avatars.com/api/?name=${letters}&background=${color}&color=fff&bold=true`;
}
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR').format(amount || 0);
}
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return console.warn('Toast:', message);
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let iconSvg = '';
    if (type === 'success') iconSvg = '<polyline points="20 6 9 17 4 12"></polyline>';
    else if (type === 'error') iconSvg = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
    else iconSvg = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';
    toast.innerHTML = `<div class="toast-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg></div><div class="toast-content"><div class="toast-title">${type === 'success' ? 'Succès' : type === 'error' ? 'Erreur' : 'Information'}</div><div class="toast-message">${escapeHTML(message)}</div></div>`;
    container.appendChild(toast);
    requestAnimationFrame(() => setTimeout(() => toast.classList.add('show'), 10));
    setTimeout(() => { toast.classList.remove('show'); toast.classList.add('hiding'); setTimeout(() => toast.remove(), 400); }, 4000);
}

// Redéfinition globale de alert() pour utiliser Toasts
window.alert = function(message) {
    if (!message) return;
    const msgStr = message.toString();
    const type = msgStr.toLowerCase().includes('erreur') ? 'error' : 'info';
    showToast(msgStr, type);
};
// --- 3. DOM ELEMENTS ---
const splashScreen = document.getElementById('splash-screen');
const appContainer = document.getElementById('app-container');
const btnStart = document.getElementById('btn-start');
const soundSuccess = document.getElementById('sound-success');

// Les boutons d'actions rapides sont lus directement dans setupQuickActions() (appelée dans init() après DOMContentLoaded)

const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

// --- 4. LIFECYCLE INITIALIZATION ---
async function init() {
    if (btnStart) btnStart.addEventListener('click', () => { splashScreen.classList.add('hidden'); appContainer.classList.remove('hidden'); });

    showGlobalLoader();

    // 1. Initialisation DataService & Vérification Auth
    if (typeof DataService !== 'undefined') {
        await DataService.init();
        if (!DataService.isDemoMode()) {
            const { data: { session }, error } = await DataService.getSession();
            if (error || !session) {
                alert('Vous avez été déconnecté.');
                window.location.href = '/connexion/index.html';
                return; // On arrête l'initialisation du dashboard
            }
            
            // Utilisateur connecté
            console.log('[Auth] Connecté en tant que:', session.user.email);
            
            // Mise à jour basique du nom (en attendant le chargement du profil)
            const username = session.user.email.split('@')[0];
            document.querySelectorAll('.sb-uname').forEach(el => el.textContent = username);
            document.querySelectorAll('.tb-title').forEach(el => el.innerHTML = `Bienvenue, ${username} ! &#x1F44B;`);
        }
    }

    // Theme
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) btnThemeToggle.addEventListener('click', toggleTheme);
    loadThemePreference();

    // Mobile Sidebar
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    // Members search
    const membersSearch = document.getElementById('members-search');
    if (membersSearch) {
        membersSearch.addEventListener('input', (e) => {
            renderMembersTab(e.target.value);
        });
    }
    const sidebarMenuContainer = document.getElementById('sidebar-menu-container');
    if (btnToggleSidebar && sidebarMenuContainer) {
        btnToggleSidebar.addEventListener('click', (e) => { e.stopPropagation(); sidebarMenuContainer.classList.toggle('mobile-open'); });
        document.addEventListener('click', (e) => {
            if (sidebarMenuContainer.classList.contains('mobile-open') && !sidebarMenuContainer.contains(e.target) && e.target !== btnToggleSidebar) {
                sidebarMenuContainer.classList.remove('mobile-open');
            }
        });
    }

    setupQuickActions();

    // L'écouteur du sous-menu "Paiements" a été déplacé à la fin du fichier pour garantir son fonctionnement.


    // --- Navigation menu (sidebar) - uniquement les boutons avec data-tab ---
    document.querySelectorAll('.nav-item[data-tab], .nav-subitem[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
            // Fermer le menu mobile après navigation
            const sidebar = document.getElementById('sidebar-menu-container');
            if (sidebar) sidebar.classList.remove('mobile-open');
        });
    });

    // DYNAMIC DATA LOAD
    await loadDynamicData();
    renderDashboard();
    animateDonutChart();
    hideGlobalLoader();

    // Démarrer la visite guidée si c'est la première fois
    if (!localStorage.getItem('tontine_onboarding_done')) {
        setTimeout(startOnboardingTour, 1000);
    }
}

async function logoutUser() {
    await window.SupabaseService.signOut();
    window.location.href = '/connexion/index.html';
}

function showGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'flex';
}
function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
}

// --- 5. DYNAMIC DATA & CALCULATION ---
function renderSkeletons() {
    const tBody = document.getElementById('tontines-table-body');
    if (tBody) {
        let skels = '';
        for(let i=0; i<3; i++) skels += `<tr><td colspan="7" style="padding:15px;"><div class="skeleton" style="height:30px;width:100%;border-radius:4px;"></div></td></tr>`;
        tBody.innerHTML = skels;
    }
    const mBody = document.getElementById('extended-members-list');
    if (mBody) {
        let skels = '';
        for(let i=0; i<3; i++) skels += `<div style="padding:15px;"><div class="skeleton" style="height:50px;width:100%;border-radius:8px;"></div></div>`;
        mBody.innerHTML = skels;
    }
    const txBody = document.getElementById('master-registry-table-body');
    if (txBody) {
        let skels = '';
        for(let i=0; i<3; i++) skels += `<tr><td colspan="7" style="padding:15px;"><div class="skeleton" style="height:30px;width:100%;border-radius:4px;"></div></td></tr>`;
        txBody.innerHTML = skels;
    }
}

async function loadDynamicData() {
    if (typeof DataService !== 'undefined') {
        if (typeof getSupabaseClient === 'function') {
            const client = getSupabaseClient();
            if (client) {
                try {
                    const { data: { user } } = await client.auth.getUser();
                    if (user) {
                        state.user.name = user.user_metadata?.full_name || user.email || 'Utilisateur';
                    }
                } catch (e) {}
            }
        }

        renderSkeletons();

        const tontines = await DataService.getTontines().catch(() => []);
        if (tontines && tontines.length > 0) state.activeTontines = tontines;

        const messages = await DataService.getRecentMessages().catch(() => []);
        if (messages && messages.length > 0) state.recentMessages = messages;

        const members = await DataService.getMembers().catch(() => []);
        if (members && members.length > 0) extendedMembers = members;

        const transactions = await DataService.getTransactions().catch(() => []);
        let demoTxs = JSON.parse(localStorage.getItem('demo_transactions') || 'null');
        
        // Si c'est la toute première fois (historique vierge), on ajoute une ligne de bienvenue pour ne pas laisser le tableau vide
        if (!demoTxs || demoTxs.length === 0) {
            demoTxs = [{
                id: 'tx-welcome',
                title: 'Cotisation Initiale (Démo)',
                date: new Date().toLocaleDateString('fr-FR'),
                amount: 10000,
                type: 'deposit',
                icon: 'user',
                tontine: 'Général'
            }];
            localStorage.setItem('demo_transactions', JSON.stringify(demoTxs));
        }
        state.transactions = [...demoTxs, ...(transactions || [])];

        // Vraies Statistiques Globales : 17.3M et 86%
        renderMembers();
        if (window.SupabaseService && window.SupabaseService.fetchPaymentsForReports) {
            const payments = await window.SupabaseService.fetchPaymentsForReports().catch(() => []);
            if (payments && payments.length > 0) {
                let totalInPlay = 0;
                state.activeTontines.forEach(t => {
                    const maxM = parseInt(t.members.split('/')[1]) || 10;
                    totalInPlay += (t.amount * maxM);
                });

                let receivedCount = 0;
                let pendingCount = 0;
                let delayedCount = 0;
                let receivedAmount = 0;
                let pendingAmount = 0;
                let delayedAmount = 0;

                payments.forEach(p => {
                    const amt = p.amount || 0;
                    if (p.status === 'valide') { receivedCount++; receivedAmount += amt; }
                    else if (p.status === 'retard') { delayedCount++; delayedAmount += amt; }
                    else { pendingCount++; pendingAmount += amt; }
                });

                const totalP = payments.length || 1;
                state.stats.totalAmountInPlay = totalInPlay > 0 ? totalInPlay : 17300000;
                state.stats.participationRate = ((receivedCount / totalP) * 100).toFixed(1);
                state.stats.validatedPaymentsToday = receivedCount;
                state.stats.activeTontines = state.activeTontines.length;

                state.donut.receivedPercent = Math.round((receivedCount / totalP) * 100);
                state.donut.pendingPercent = Math.round((pendingCount / totalP) * 100);
                state.donut.delayedPercent = Math.round((delayedCount / totalP) * 100);
                
                state.donut.receivedAmount = receivedAmount;
                state.donut.pendingAmount = pendingAmount;
                state.donut.delayedAmount = delayedAmount;
                
                state.donut.receivedCount = receivedCount;
                state.donut.pendingCount = pendingCount;
                state.donut.delayedCount = delayedCount;
                
                // Calcul du vrai total de membres (en prenant le 2ème élément de "0/20")
                state.stats.totalMembersCount = state.activeTontines.reduce((acc, t) => {
                    const parts = t.members.split('/');
                    return acc + (parseInt(parts[1]) || parseInt(parts[0]) || 0);
                }, 0);
            }
        }
    }
}

// --- 6. POPUPS & QUICK ACTIONS ---
function setupQuickActions() {
    // Lecture des boutons directement ici, DOM garanti prêt (appelé depuis init() > DOMContentLoaded)
    const btnQuickCreateTontine = document.getElementById('btn-quick-create-tontine');
    const btnQuickSendMsg       = document.getElementById('btn-quick-send-msg');
    const btnQuickValidatePay   = document.getElementById('btn-quick-validate-pay');
    const btnQuickViewReports   = document.getElementById('btn-quick-view-reports');

    // 1. Créer tontine
    if (btnQuickCreateTontine) {
        btnQuickCreateTontine.addEventListener('click', () => {
            const m = document.getElementById('create-tontine-modal');
            if (m) m.classList.remove('hidden');
        });
    }

    const btnCloseTontine = document.getElementById('btn-close-create-tontine-modal');
    if (btnCloseTontine) btnCloseTontine.addEventListener('click', () => document.getElementById('create-tontine-modal').classList.add('hidden'));

    // Create Tontine Submit
    const btnSubmitCreateTontine = document.getElementById('btn-submit-create-tontine');
    if (btnSubmitCreateTontine) {
        btnSubmitCreateTontine.addEventListener('click', async () => {
            if (btnSubmitCreateTontine.disabled) return;
            btnSubmitCreateTontine.disabled = true;

            const name = document.getElementById('tontine-name-input').value.trim();
            const amount = parseInt(document.getElementById('tontine-amount-input').value);
            const frequency = document.getElementById('tontine-frequency-input').value;
            const maxMembers = parseInt(document.getElementById('tontine-max-members-input').value);

            if (!name) {
                showToast("Le nom de la tontine est obligatoire.", "error");
                btnSubmitCreateTontine.disabled = false;
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                showToast("Veuillez entrer un montant valide.", "error");
                btnSubmitCreateTontine.disabled = false;
                return;
            }
            if (isNaN(maxMembers) || maxMembers <= 0) {
                showToast("Le nombre de membres doit être supérieur à 0.", "error");
                btnSubmitCreateTontine.disabled = false;
                return;
            }

            // Anti-doublon
            const isDuplicate = state.activeTontines.some(t => t.name.toLowerCase() === name.toLowerCase());
            if (isDuplicate) {
                showToast("Une tontine avec ce nom existe déjà.", "error");
                btnSubmitCreateTontine.disabled = false;
                return;
            }

            showGlobalLoader();
            const { data, error } = await DataService.createTontine({
                name: name,
                amount_per_cycle: amount,
                frequency: frequency,
                max_members: maxMembers || 10
            });
            hideGlobalLoader();
            btnSubmitCreateTontine.disabled = false;

            if (error) {
                const errMsg = typeof error === 'object' ? (error.message || JSON.stringify(error)) : error;
                showToast("Erreur lors de la création : " + errMsg, "error");
            } else {
                document.getElementById('create-tontine-modal').classList.add('hidden');
                document.getElementById('tontine-name-input').value = '';
                document.getElementById('tontine-amount-input').value = '';
                
                showToast("Tontine créée avec succès !", "success");
                
                if (typeof soundSuccess !== 'undefined' && soundSuccess) {
                    soundSuccess.volume = 0.5;
                    soundSuccess.play().catch(() => {});
                }
                
                if (data && data.length > 0) {
                    const newTontine = data[0];
                    state.activeTontines.push({
                        id: newTontine.id,
                        name: newTontine.name,
                        amount: newTontine.amount_per_cycle,
                        frequency: newTontine.frequency,
                        members: newTontine.current_members + "/" + newTontine.max_members,
                        progression: newTontine.progression,
                        status: newTontine.status
                    });
                } else {
                    await loadDynamicData();
                }
                
                renderDashboard();
                updateStats(); // Mise à jour des compteurs du dashboard
            }
        });
    }

    // Edit Tontine Submit
    const btnCloseEditTontine = document.getElementById('btn-close-edit-tontine-modal');
    if (btnCloseEditTontine) {
        btnCloseEditTontine.addEventListener('click', () => {
            document.getElementById('edit-tontine-modal').classList.add('hidden');
        });
    }

    const btnSubmitEditTontine = document.getElementById('btn-submit-edit-tontine');
    if (btnSubmitEditTontine) {
        btnSubmitEditTontine.addEventListener('click', async () => {
            if (btnSubmitEditTontine.disabled) return;
            btnSubmitEditTontine.disabled = true;

            const id = document.getElementById('edit-tontine-id-input').value;
            const name = document.getElementById('edit-tontine-name-input').value;
            const amount = parseInt(document.getElementById('edit-tontine-amount-input').value);
            const frequency = document.getElementById('edit-tontine-frequency-input').value;
            const maxMembers = parseInt(document.getElementById('edit-tontine-max-members-input').value);

            if (!id || !name || isNaN(amount)) {
                alert("Veuillez remplir correctement les champs.");
                btnSubmitEditTontine.disabled = false;
                return;
            }

            showGlobalLoader();
            const { error } = await DataService.updateTontine(id, {
                name: name,
                amount_per_cycle: amount,
                frequency: frequency,
                max_members: maxMembers || 10
            });
            hideGlobalLoader();
            btnSubmitEditTontine.disabled = false;

            if (error) {
                alert("Erreur lors de la modification : " + error);
            } else {
                document.getElementById('edit-tontine-modal').classList.add('hidden');
                await loadDynamicData();
                renderDashboard();
                
                if (typeof soundSuccess !== 'undefined' && soundSuccess) {
                    soundSuccess.volume = 0.5;
                    soundSuccess.play().catch(() => {});
                }
            }
        });
    }

    // Tontine Details Close
    const btnCloseTontineDetails = document.getElementById('btn-close-tontine-details-modal');
    if (btnCloseTontineDetails) {
        btnCloseTontineDetails.addEventListener('click', () => {
            document.getElementById('tontine-details-modal').classList.add('hidden');
        });
    }
    const btnCloseTontineDetails2 = document.getElementById('btn-close-tontine-details-btn');
    if (btnCloseTontineDetails2) {
        btnCloseTontineDetails2.addEventListener('click', () => {
            document.getElementById('tontine-details-modal').classList.add('hidden');
        });
    }

    // 2. Envoyer message
    if (btnQuickSendMsg) {
        btnQuickSendMsg.addEventListener('click', () => {
            const m = document.getElementById('send-message-modal');
            if (m) {
                const s = document.getElementById('message-recipient-input');
                if (s) {
                    s.innerHTML = '<option value="">Sélectionnez un destinataire</option>';
                    state.activeTontines.forEach(t => {
                        s.innerHTML += `<option value="${t.name}">Groupe: ${t.name}</option>`;
                    });
                }
                m.classList.remove('hidden');
            }
        });
    }

    const btnCloseMsg = document.getElementById('btn-close-send-message-modal');
    if (btnCloseMsg) btnCloseMsg.addEventListener('click', () => document.getElementById('send-message-modal').classList.add('hidden'));

    const btnSubmitMsg = document.getElementById('btn-submit-send-message');
    if (btnSubmitMsg) {
        btnSubmitMsg.addEventListener('click', async () => {
            const recip = document.getElementById('message-recipient-input').value;
            const cont = document.getElementById('message-content-input').value;

            if (!recip || !cont) return alert("Veuillez choisir un destinataire et écrire un message.");
            btnSubmitMsg.disabled = true;
            btnSubmitMsg.textContent = "Envoi...";

            const res = await DataService.createMessage({ conversation_id: null, content: cont });

            btnSubmitMsg.disabled = false;
            btnSubmitMsg.textContent = "Envoyer le message";

            if (res && !res.error) {
                document.getElementById('send-message-modal').classList.add('hidden');
                document.getElementById('message-content-input').value = '';
                playSuccessSound();
                await loadDynamicData();
                renderDashboard();
            } else {
                let errorMsg = res ? res.error : "Erreur inconnue";
                if (typeof errorMsg === 'object' && errorMsg !== null) {
                    errorMsg = errorMsg.message || JSON.stringify(errorMsg);
                }
                alert("Erreur lors de l'envoi : " + errorMsg);
            }
        });
    }

    // 3. Valider paiement
    if (btnQuickValidatePay) {
        btnQuickValidatePay.addEventListener('click', () => {
            const m = document.getElementById('validate-payment-modal');
            if (m) {
                const s = document.getElementById('payment-member-input');
                if (s) {
                    s.innerHTML = '<option value="">Sélectionnez un membre</option>';
                    const memberList = state.extendedMembers || (typeof extendedMembers !== 'undefined' ? extendedMembers : []);
                    memberList.forEach(mem => {
                        s.innerHTML += `<option value="${mem.id}">${mem.name || mem.full_name}</option>`;
                    });
                }
                m.classList.remove('hidden');
            }
        });
    }

    const btnClosePay = document.getElementById('btn-close-validate-payment-modal');
    if (btnClosePay) btnClosePay.addEventListener('click', () => document.getElementById('validate-payment-modal').classList.add('hidden'));

    const btnSubmitPay = document.getElementById('btn-submit-validate-payment');
    if (btnSubmitPay) {
        btnSubmitPay.addEventListener('click', async () => {
            const memId = document.getElementById('payment-member-input').value;
            const amt = document.getElementById('payment-amount-input').value;

            if (!memId) {
                showToast("Veuillez sélectionner un membre.", "error");
                return;
            }
            if (!amt || parseFloat(amt) <= 0) {
                showToast("Veuillez entrer un montant valide.", "error");
                return;
            }

            btnSubmitPay.disabled = true;

            showGlobalLoader();
            const { data, error } = await DataService.createPayment({ member_id: memId, amount: parseFloat(amt) });
            hideGlobalLoader();

            btnSubmitPay.disabled = false;

            if (error) {
                const errMsg = typeof error === 'object' ? (error.message || JSON.stringify(error)) : error;
                showToast("Erreur lors de la validation : " + errMsg, "error");
            } else {
                document.getElementById('validate-payment-modal').classList.add('hidden');
                document.getElementById('payment-amount-input').value = '';
                
                showToast("Paiement validé avec succès !", "success");
                
                if (typeof playSuccessSound === 'function') {
                    playSuccessSound();
                }
                
                if (data && data.length > 0) {
                    const newPay = data[0];
                    const memberList = state.extendedMembers || (typeof extendedMembers !== 'undefined' ? extendedMembers : []);
                    const foundMem = memberList.find(m => m.id === memId);
                    const memName = foundMem ? (foundMem.name || foundMem.full_name) : "Membre Inconnu";
                    
                    if (!state.transactions) state.transactions = [];
                    state.transactions.unshift({
                        id: newPay.id,
                        member: memName,
                        tontine: "Tontine Principale",
                        amount: newPay.amount,
                        type: 'Cotisation',
                        status: newPay.status === 'valide' ? 'Validé' : 'En attente',
                        date: newPay.created_at || new Date().toISOString()
                    });
                    
                    state.stats.validatedPaymentsToday = (state.stats.validatedPaymentsToday || 0) + 1;
                    state.stats.totalAmountInPlay = (state.stats.totalAmountInPlay || 0) + parseFloat(amt);
                } else {
                    await loadDynamicData();
                }
                
                renderDashboard();
                if (typeof renderRegistryTab === 'function') renderRegistryTab();
                if (typeof animateDonutChart === 'function') animateDonutChart();
            }
        });
    }

    // 4. Voir rapports
    if (btnQuickViewReports) {
        btnQuickViewReports.addEventListener('click', async () => {
            const m = document.getElementById('reports-modal');
            if (!m) return;
            m.classList.remove('hidden');

            const totalEl = document.getElementById('report-total-collected');
            const delayEl = document.getElementById('report-delay-rate');
            totalEl.textContent = "Chargement...";
            delayEl.textContent = "...";

            const data = await DataService.getReportsData().catch(() => null);
            if (data) {
                totalEl.textContent = new Intl.NumberFormat('fr-FR').format(data.totalCollected) + " FCFA";
                delayEl.textContent = data.delayRate + "%";

                let labels = data.chartData.labels;
                let dataPoints = data.chartData.dataPoints;

                // Génération d'une courbe en dents de scie pour la démo s'il manque des données historiques
                if (labels.length <= 1) {
                    labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août'];
                    dataPoints = [120000, 210000, 160000, 280000, 190000, 310000, 240000, 350000];
                }

                const ctx = document.getElementById('payments-evolution-chart');
                if (ctx && window.Chart) {
                    if (reportsChartInstance) reportsChartInstance.destroy();
                    reportsChartInstance = new window.Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Cotisations perçues (FCFA)',
                                data: dataPoints,
                                borderColor: '#5C60F5',
                                backgroundColor: 'rgba(92, 96, 245, 0.08)',
                                borderWidth: 1.5,
                                fill: true,
                                tension: 0.1 // 0.1 pour l'effet "dents de scie"
                            }]
                        },
                        options: { 
                            responsive: true, 
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                y: { beginAtZero: true }
                            }
                        }
                    });
                }
            } else {
                totalEl.textContent = "0 FCFA";
                delayEl.textContent = "0%";
            }
        });
    }

    const btnCloseReports = document.getElementById('btn-close-reports-modal');
    if (btnCloseReports) btnCloseReports.addEventListener('click', () => document.getElementById('reports-modal').classList.add('hidden'));

    // 5. Ajouter un membre
    const btnQuickAddMember = document.getElementById('btn-quick-add-member');
    if (btnQuickAddMember) {
        btnQuickAddMember.addEventListener('click', () => {
            const m = document.getElementById('add-member-modal');
            if (m) m.classList.remove('hidden');
        });
    }

    const btnCloseAddMember = document.getElementById('btn-close-add-member-modal');
    if (btnCloseAddMember) {
        btnCloseAddMember.addEventListener('click', () => {
            document.getElementById('add-member-modal').classList.add('hidden');
        });
    }

    const btnSubmitAddMember = document.getElementById('btn-submit-add-member');
    if (btnSubmitAddMember) {
        btnSubmitAddMember.addEventListener('click', async () => {
            if (btnSubmitAddMember.disabled) return;
            btnSubmitAddMember.disabled = true;

            const name = document.getElementById('member-name-input').value.trim();
            const phone = document.getElementById('member-phone-input').value.trim();
            const email = document.getElementById('member-email-input').value.trim();
            const status = document.getElementById('member-status-input').value;

            if (!name) {
                showToast("Le nom du membre est obligatoire.", "error");
                btnSubmitAddMember.disabled = false;
                return;
            }
            if (!phone) {
                showToast("Le numéro de téléphone est obligatoire.", "error");
                btnSubmitAddMember.disabled = false;
                return;
            }

            // Anti-doublon (téléphone)
            const isDuplicate = state.extendedMembers && state.extendedMembers.some(m => m.phone === phone);
            if (isDuplicate) {
                showToast("Un membre avec ce numéro de téléphone existe déjà.", "error");
                btnSubmitAddMember.disabled = false;
                return;
            }

            showGlobalLoader();
            const { data, error } = await DataService.createMember({
                name: name,
                phone: phone,
                email: email,
                status: status
            });
            hideGlobalLoader();
            btnSubmitAddMember.disabled = false;

            if (error) {
                const errMsg = typeof error === 'object' ? (error.message || JSON.stringify(error)) : error;
                showToast("Erreur lors de l'ajout : " + errMsg, "error");
            } else {
                document.getElementById('add-member-modal').classList.add('hidden');
                document.getElementById('member-name-input').value = '';
                document.getElementById('member-phone-input').value = '';
                document.getElementById('member-email-input').value = '';
                
                showToast("Membre ajouté avec succès !", "success");
                
                if (typeof soundSuccess !== 'undefined' && soundSuccess) {
                    soundSuccess.volume = 0.5;
                    soundSuccess.play().catch(() => {});
                }
                
                if (data && data.length > 0) {
                    const newMember = data[0];
                    if (!state.extendedMembers) state.extendedMembers = [];
                    state.extendedMembers.push({
                        id: newMember.id,
                        name: newMember.full_name,
                        phone: newMember.phone,
                        avatar: newMember.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(newMember.full_name)}&background=5C60F5&color=fff`,
                        trust: newMember.reliability_score || 100,
                        trustClass: 'excellent',
                        status: newMember.is_active ? 'Actif' : 'Inactif',
                        tontines: 0,
                        contributed: 0
                    });
                } else {
                    await loadDynamicData();
                }
                
                if (typeof renderMembersTab === 'function') {
                    await renderMembersTab();
                }
            }
        });
    }

    // 6. Clôturer ce tour
    const btnCloseCurrentRound = document.getElementById('btn-close-current-round');
    const modalCloseRound = document.getElementById('close-round-modal');
    
    if (btnCloseCurrentRound) {
        btnCloseCurrentRound.addEventListener('click', () => {
            if (!state.activeTontines || state.activeTontines.length === 0) {
                showToast("Aucune tontine active à clôturer", "error");
                return;
            }
            const firstTontine = state.activeTontines[0];
            const maxM = parseInt(firstTontine.members.split('/')[1]) || 10;
            const totalPayout = firstTontine.amount * maxM;
            const currentRound = firstTontine.currentRound || 1;
            const beneficiaryMember = (typeof extendedMembers !== 'undefined' && extendedMembers.length > 0) ? extendedMembers[(currentRound - 1) % extendedMembers.length] : null;
            const beneficiaryName = beneficiaryMember ? beneficiaryMember.name : ("Membre " + firstTontine.name + (currentRound > 1 ? ` (Tour ${currentRound})` : ""));
            const beneficiaryAvatarSrc = beneficiaryMember && beneficiaryMember.avatar ? beneficiaryMember.avatar : getAvatarInitials(beneficiaryName);

            document.getElementById('close-round-tontine-name').textContent = firstTontine.name;
            document.getElementById('close-round-amount').innerHTML = `${new Intl.NumberFormat('fr-FR').format(totalPayout)} FCFA`;
            document.getElementById('close-round-beneficiary').textContent = beneficiaryName;
            document.getElementById('close-round-avatar').src = beneficiaryAvatarSrc;

            if (modalCloseRound) modalCloseRound.classList.remove('hidden');
        });
    }

    const btnCancelCloseRound = document.getElementById('btn-cancel-close-round');
    const btnXCloseRound = document.getElementById('btn-close-round-modal-x');
    
    if (btnCancelCloseRound) btnCancelCloseRound.addEventListener('click', () => modalCloseRound.classList.add('hidden'));
    if (btnXCloseRound) btnXCloseRound.addEventListener('click', () => modalCloseRound.classList.add('hidden'));

    const btnConfirmCloseRound = document.getElementById('btn-confirm-close-round');
    if (btnConfirmCloseRound) {
        btnConfirmCloseRound.addEventListener('click', async () => {
            if (btnConfirmCloseRound.disabled) return;
            btnConfirmCloseRound.disabled = true;

            const firstTontine = state.activeTontines[0];
            const maxM = parseInt(firstTontine.members.split('/')[1]) || 10;
            const totalPayout = firstTontine.amount * maxM;
            const currentRound = firstTontine.currentRound || 1;
            const beneficiaryMember = (typeof extendedMembers !== 'undefined' && extendedMembers.length > 0) ? extendedMembers[(currentRound - 1) % extendedMembers.length] : null;
            const beneficiaryName = beneficiaryMember ? beneficiaryMember.name : ("Membre " + firstTontine.name + (currentRound > 1 ? ` (Tour ${currentRound})` : ""));

            showGlobalLoader();

            // Créer une transaction de retrait
            const payoutTx = {
                id: 'tx-payout-' + Date.now(),
                title: 'Bénéficiaire : ' + beneficiaryName,
                date: new Date().toLocaleDateString('fr-FR'),
                amount: totalPayout,
                type: 'withdrawal',
                icon: 'gift',
                tontine: firstTontine.name
            };
            
            // Simuler la remise à zéro des paiements de la tontine (0/10)
            firstTontine.members = `0/${maxM}`;
            firstTontine.currentRound = currentRound + 1; // Avancer au prochain tour
            
            // Remettre à zéro les statistiques du dashboard
            if (state.stats) {
                state.stats.participationRate = 0;
                state.stats.validatedPaymentsToday = 0;
            }
            if (state.donut) {
                state.donut.receivedPercent = 0;
                state.donut.receivedAmount = 0;
                state.donut.pendingPercent = 0;
                state.donut.pendingAmount = 0;
                state.donut.delayedPercent = 0;
                state.donut.delayedAmount = 0;
            }
            
            // Ajouter à l'historique local (pour effet immédiat)
            if (!state.transactions) state.transactions = [];
            state.transactions.unshift(payoutTx);
            
            // Sauvegarder dans localStorage pour la maquette (persistance après rafraîchissement)
            const demoTxs = JSON.parse(localStorage.getItem('demo_transactions') || '[]');
            demoTxs.unshift(payoutTx);
            localStorage.setItem('demo_transactions', JSON.stringify(demoTxs));

            hideGlobalLoader();
            btnConfirmCloseRound.disabled = false;
            
            if (modalCloseRound) modalCloseRound.classList.add('hidden');
            
            showToast("Tour clôturé avec succès ! Fonds distribués.", "success");
            
            if (typeof playSuccessSound === 'function') {
                playSuccessSound();
            }

            // Mettre à jour l'interface
            renderDashboard();
            if (typeof animateDonutChart === 'function') animateDonutChart();
            
            // Si on est sur l'onglet mes tontines, le mettre à jour aussi
            if (typeof updateCircleView === 'function') {
                const select = document.getElementById('circle-group-select');
                if (select && select.value == firstTontine.id) {
                    updateCircleView(firstTontine);
                }
            }
        });
    }
}

// --- 7. RENDERING FUNCTIONS ---
function renderDashboard() {
    // Intelligent greeting
    const greetingEl = document.getElementById('dashboard-greeting');
    if (greetingEl) {
        const hour = new Date().getHours();
        const greeting = hour < 18 ? 'Bonjour' : 'Bonsoir';
        let displayName = state.user.name.split('@')[0];
        displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        greetingEl.innerHTML = `${greeting}, ${escapeHTML(displayName)} ! &#x1F44B;`;
        
        // Update settings inputs if they exist
        const nameInput = document.getElementById('settings-name-input');
        if (nameInput) nameInput.value = state.user.name;
        
        const emailInput = document.getElementById('settings-email-input');
        if (emailInput && typeof getSupabaseClient === 'function') {
            const client = getSupabaseClient();
            if (client) {
                client.auth.getUser().then(({ data: { user } }) => {
                    if (user && user.email) emailInput.value = user.email;
                }).catch(()=>{});
            }
        }
    }

    renderStats();
    renderTontinesTable();
    renderTransactions();
    renderRecentMessages();
    renderActivityFeed();
}

function renderStats() {
    const stat1 = document.getElementById('stats-active-tontines');
    if (stat1) stat1.textContent = state.stats.activeTontines;

    const stat2 = document.getElementById('stats-total-pool-label');
    if (stat2) stat2.innerHTML = formatCurrency(state.stats.totalAmountInPlay) + ' <span class="stat-cur">FCFA</span>';

    const stat3 = document.getElementById('stats-current-rounds');
    if (stat3) stat3.textContent = state.stats.toursInProgress;

    const stat4 = document.getElementById('stats-validated-payments');
    if (stat4) stat4.textContent = state.stats.validatedPaymentsToday;

    const rate = document.getElementById('participation-rate-value');
    if (rate) rate.textContent = state.stats.participationRate + "%";
    
    const rateBar = document.getElementById('participation-rate-bar');
    if (rateBar) rateBar.style.width = state.stats.participationRate + "%";
    
    // Legends
    const lReceived = document.getElementById('legend-val-received');
    if (lReceived) lReceived.innerHTML = `<strong>${state.donut.receivedPercent || 0}%</strong> (${formatCurrency(state.donut.receivedAmount || 0)} FCFA)`;
    
    const lPending = document.getElementById('legend-val-pending');
    if (lPending) lPending.innerHTML = `<strong>${state.donut.pendingPercent || 0}%</strong> (${formatCurrency(state.donut.pendingAmount || 0)} FCFA)`;
    
    const lDelayed = document.getElementById('legend-val-delayed');
    if (lDelayed) lDelayed.innerHTML = `<strong>${state.donut.delayedPercent || 0}%</strong> (${formatCurrency(state.donut.delayedAmount || 0)} FCFA)`;
    
    // Status counts
    const sReceived = document.getElementById('status-count-received');
    if (sReceived) sReceived.textContent = state.donut.receivedCount || 0;
    
    const sPending = document.getElementById('status-count-pending');
    if (sPending) sPending.textContent = state.donut.pendingCount || 0;
    
    const sDelayed = document.getElementById('status-count-delayed');
    if (sDelayed) sDelayed.textContent = state.donut.delayedCount || 0;
    
    const sTotal = document.getElementById('status-count-total');
    if (sTotal) sTotal.textContent = state.stats.totalMembersCount || 0;

    // Prochain tour (Dynamic Avatar)
    const nextAvatar = document.getElementById('next-round-avatar');
    const nextName = document.getElementById('next-round-name');
    const nextAmount = document.getElementById('next-round-payout-amount');
    const nextTontine = document.getElementById('next-round-tontine-name');
    const nextTourCount = document.getElementById('next-round-tour-count');
    const nextDate = document.getElementById('next-round-date');
    
    if (state.activeTontines && state.activeTontines.length > 0) {
        const firstTontine = state.activeTontines[0];
        const memberCount = parseInt(firstTontine.members.split('/')[1]) || 10;
        const paidCount = parseInt(firstTontine.members.split('/')[0]) || 0;
        const collectedPayout = firstTontine.amount * paidCount;
        const currentRound = firstTontine.currentRound || 1;
        const beneficiaryMember = (typeof extendedMembers !== 'undefined' && extendedMembers.length > 0) ? extendedMembers[(currentRound - 1) % extendedMembers.length] : null;
        const beneficiaryName = beneficiaryMember ? beneficiaryMember.name : ("Membre " + firstTontine.name + (currentRound > 1 ? ` (Tour ${currentRound})` : ""));
        const beneficiaryAvatarSrc = beneficiaryMember && beneficiaryMember.avatar ? beneficiaryMember.avatar : getAvatarInitials(beneficiaryName);
        if (nextAvatar && nextName) {
            nextName.textContent = escapeHTML(beneficiaryName);
            nextAvatar.src = beneficiaryAvatarSrc;
        }
        if (nextAmount) {
            nextAmount.innerHTML = `${formatCurrency(collectedPayout)} <span class="payout-currency">FCFA</span>`;
        }
        if (nextTontine) {
            nextTontine.textContent = escapeHTML(firstTontine.name);
        }
        if (nextTourCount) {
            nextTourCount.textContent = currentRound;
        }
        if (nextDate) {
            // Pour la démo, on considère que le tour arrive à échéance aujourd'hui
            const expectedDate = new Date();
            nextDate.innerHTML = `
            <span style="display:flex; align-items:center; gap:5px;" id="next-date-display">
                <span id="next-date-text">${expectedDate.toLocaleDateString('fr-FR')}</span> 
                <svg id="btn-edit-next-date" style="cursor:pointer; color:#94a3b8;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Modifier la date"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </span>
            <input type="date" id="next-date-input" style="display:none; width: 100%; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 5px; font-size: 13px; font-family: inherit; color: #1e293b;">`;
            
            // Attacher les événements pour rendre le crayon fonctionnel
            setTimeout(() => {
                const btnEdit = document.getElementById('btn-edit-next-date');
                const dateText = document.getElementById('next-date-text');
                const dateInput = document.getElementById('next-date-input');
                const displaySpan = document.getElementById('next-date-display');
                
                if (btnEdit && dateInput && displaySpan) {
                    dateInput.value = expectedDate.toISOString().split('T')[0];
                    
                    btnEdit.addEventListener('click', () => {
                        displaySpan.style.display = 'none';
                        dateInput.style.display = 'block';
                        dateInput.focus();
                    });
                    
                    const saveDate = () => {
                        if (dateInput.value) {
                            const newDate = new Date(dateInput.value);
                            dateText.textContent = newDate.toLocaleDateString('fr-FR');
                        }
                        dateInput.style.display = 'none';
                        displaySpan.style.display = 'flex';
                    };
                    
                    dateInput.addEventListener('blur', saveDate);
                    dateInput.addEventListener('change', saveDate);
                    dateInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') saveDate();
                    });
                }
            }, 0);
        }
    } else {
        if (nextAvatar && nextName) {
            nextName.textContent = "-";
            nextAvatar.src = getAvatarInitials("-");
        }
        if (nextAmount) {
            nextAmount.innerHTML = `0 <span class="payout-currency">FCFA</span>`;
        }
        if (nextTontine) {
            nextTontine.textContent = "-";
        }
        if (nextTourCount) nextTourCount.textContent = "-";
        if (nextDate) nextDate.textContent = "-";
    }
}

function renderTontinesTable() {
    // Inject CSS for dropdown if not exists (bypasses cache and fixes variable names)
    if (!document.getElementById('action-menu-styles')) {
        const style = document.createElement('style');
        style.id = 'action-menu-styles';
        style.innerHTML = `
            .action-dropdown {
                position: absolute;
                right: 0;
                top: 100%;
                background: var(--card, #fff);
                border: 1px solid var(--border, #E2E8F0);
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                min-width: 160px;
                z-index: 999;
                opacity: 0;
                visibility: hidden;
                transform: translateY(10px);
                transition: all 0.2s ease;
                display: flex;
                flex-direction: column;
                padding: 4px 0;
            }
            .tbl-wrap { overflow: visible !important; }
            .action-dropdown.show {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            .action-dropdown-item {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                color: var(--text-1, #1E293B);
                text-decoration: none;
                font-size: 13px;
                font-weight: 500;
                transition: background 0.2s;
                cursor: pointer;
            }
            .action-dropdown-item svg {
                margin-right: 8px;
                width: 16px;
                height: 16px;
                opacity: 0.7;
            }
            .action-dropdown-item:hover {
                background: var(--content-bg, #F1F5F9);
                color: var(--primary, #5C60F5);
            }
            .action-dropdown-item.danger {
                color: var(--danger, #EF4444);
            }
            .action-dropdown-item.danger:hover {
                background: var(--danger-bg, rgba(239,68,68,0.1));
            }
        `;
        document.head.appendChild(style);
    }

    const tBody = document.getElementById('tontines-table-body');
    if (!tBody) return;
    
    // Ensure the 7th column header exists
    const tableHead = tBody.parentElement.querySelector('thead tr');
    if (tableHead && tableHead.children.length === 6) {
        const actionTh = document.createElement('th');
        actionTh.style.width = '40px';
        tableHead.appendChild(actionTh);
    }
    
    tBody.innerHTML = '';

    if (!state.activeTontines || state.activeTontines.length === 0) {
        tBody.innerHTML = `<tr><td colspan="7" style="padding: 60px 20px; text-align: center;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
                <div style="background:rgba(92, 96, 245, 0.1); color:var(--primary); width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                    <i data-feather="folder-plus" style="width:32px; height:32px;"></i>
                </div>
                <div>
                    <h3 style="color:var(--text-1); font-size:18px; font-weight:700; margin-bottom:4px;">Aucune tontine active</h3>
                    <p style="color:var(--text-3); font-size:14px; max-width:300px; margin:0 auto;">Créez votre première tontine pour commencer à inviter des membres et gérer les cotisations.</p>
                </div>
                <button onclick="document.querySelector('[data-tab=\\'circle\\']').click()" style="margin-top:8px; background:var(--primary); color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 4px 12px rgba(92,96,245,0.3); transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    Créer ma première tontine
                </button>
            </div>
        </td></tr>`;
        setTimeout(() => feather.replace(), 0);
        return;
    }

    state.activeTontines.forEach(t => {
        // Simulated Health Score
        let hash = 0;
        for (let i = 0; i < t.name.length; i++) hash += t.name.charCodeAt(i);
        const healthScore = 40 + (hash % 61); // Score entre 40 et 100
        
        let healthClass = 'badge-green';
        let healthIcon = '🟢';
        if (healthScore < 60) {
            healthClass = 'badge-red';
            healthIcon = '🔴';
        } else if (healthScore < 85) {
            healthClass = 'badge-yellow';
            healthIcon = '🟠';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.name}</td>
            <td>${new Intl.NumberFormat('fr-FR').format(t.amount)} FCFA</td>
            <td>${t.frequency}</td>
            <td>${t.members}</td>
            <td>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: 0%" data-target="${t.progression}"></div>
                </div>
            </td>
            <td>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span class="badge-status ${healthClass}" style="display:inline-flex; align-items:center; gap:4px; font-weight:700;">
                        ${healthScore}% ${healthIcon}
                    </span>
                    <span style="font-size:11px; color:var(--text-3);">${t.status}</span>
                </div>
            </td>
            <td>
                <div class="action-menu-container">
                    <button class="btn-action-dots" onclick="toggleActionMenu(event, '${t.id}')" style="width: 24px; height: 24px; color: #1E293B;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                    </button>
                    <div class="action-dropdown" id="dropdown-${t.id}">
                        <a class="action-dropdown-item" onclick="openEditTontineModal('${t.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            Modifier
                        </a>
                        <a class="action-dropdown-item" onclick="openTontineDetailsModal('${t.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            Voir détails
                        </a>
                        <a class="action-dropdown-item danger" onclick="deleteTontineAction('${t.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            Supprimer
                        </a>
                    </div>
                </div>
            </td>
        `;
        tBody.appendChild(tr);

        setTimeout(() => {
            const fill = tr.querySelector('.progress-bar-fill');
            if (fill) {
                fill.style.width = fill.getAttribute('data-target') + '%';
            }
        }, 100);
    });
    
    if (window.feather) feather.replace();
}

async function deleteTontineAction(id) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette tontine ? Cette action est irréversible.")) return;
    
    showGlobalLoader();
    try {
        const { error } = await DataService.deleteTontine(id);
        if (error) {
            alert("Erreur lors de la suppression : " + error);
        } else {
            // Refresh data
            await loadDynamicData();
            renderDashboard();
        }
    } catch (err) {
        alert("Une erreur inattendue s'est produite.");
    }
    hideGlobalLoader();
}

function openEditTontineModal(id) {
    const tontine = state.activeTontines.find(t => t.id === id);
    if (!tontine) return;
    
    // Fermer les menus déroulants
    document.querySelectorAll('.action-dropdown.show').forEach(el => el.classList.remove('show'));

    document.getElementById('edit-tontine-id-input').value = tontine.id;
    document.getElementById('edit-tontine-name-input').value = tontine.name;
    document.getElementById('edit-tontine-amount-input').value = tontine.amount;
    document.getElementById('edit-tontine-frequency-input').value = tontine.frequency;
    
    // Extract max_members from string like '0/20' or '5/10'
    const maxMembers = parseInt(tontine.members.split('/')[1]) || 10;
    document.getElementById('edit-tontine-max-members-input').value = maxMembers;

    document.getElementById('edit-tontine-modal').classList.remove('hidden');
}

function openTontineDetailsModal(id) {
    const tontine = state.activeTontines.find(t => t.id === id);
    if (!tontine) return;
    
    // Fermer les menus déroulants
    document.querySelectorAll('.action-dropdown.show').forEach(el => el.classList.remove('show'));

    document.getElementById('details-tontine-name').textContent = tontine.name;
    document.getElementById('details-tontine-amount').textContent = new Intl.NumberFormat('fr-FR').format(tontine.amount) + ' FCFA';
    
    const statusEl = document.getElementById('details-tontine-status');
    statusEl.innerHTML = `<span class="badge-status ${tontine.status === 'En cours' ? 'badge-green' : 'badge-yellow'}" style="font-size: 14px; padding: 6px 12px;">${tontine.status}</span>`;
    
    document.getElementById('details-tontine-frequency').textContent = tontine.frequency;
    document.getElementById('details-tontine-members').textContent = tontine.members;
    
    document.getElementById('details-tontine-progression-text').textContent = tontine.progression + '%';
    const fill = document.getElementById('details-tontine-progression-fill');
    
    // Petit effet d'animation pour la barre
    fill.style.width = '0%';
    document.getElementById('tontine-details-modal').classList.remove('hidden');
    
    setTimeout(() => {
        fill.style.width = tontine.progression + '%';
    }, 100);
}

function renderTransactions() {
    const list = document.getElementById('transactions-list');
    if (!list) return;
    list.innerHTML = '';

    state.transactions.slice(0, 5).forEach(tx => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        const isDep = tx.type === 'deposit';
        item.innerHTML = `
            <div class="tx-icon ${isDep ? 'green' : 'red'}">
                <i data-feather="${isDep ? 'arrow-down-left' : 'arrow-up-right'}"></i>
            </div>
            <div class="tx-info">
                <div class="tx-title">${tx.title}</div>
                <div class="tx-date">${tx.date}</div>
            </div>
            <div class="tx-amount ${isDep ? 'green' : ''}">${isDep ? '+' : '-'}${new Intl.NumberFormat('fr-FR').format(tx.amount)}</div>
        `;
        list.appendChild(item);
    });
    if (window.feather) feather.replace();
}

function renderRecentMessages() {
    // There are actually two containers for recent messages. Let's find dashboard-recent-messages
    const container = document.getElementById('dashboard-recent-messages');
    if (!container) return;
    container.innerHTML = '';

    state.recentMessages.slice(0, 3).forEach(msg => {
        const item = document.createElement('div');
        item.className = 'message-item';
        item.innerHTML = `
            <div class="msg-avatar ${msg.type}">
                ${msg.type === 'group' ? '<i data-feather="users"></i>' : msg.type === 'system' ? '<i data-feather="bell"></i>' : '<i data-feather="user"></i>'}
            </div>
            <div class="msg-content">
                <div class="msg-header">
                    <span class="msg-sender">${escapeHTML(msg.sender)}</span>
                    <span class="msg-time">${escapeHTML(msg.time)}</span>
                </div>
                <div class="msg-text">${escapeHTML(msg.text)}</div>
            </div>
        `;
        container.appendChild(item);
    });
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
}

function renderActivityFeed() {
    const container = document.getElementById('dashboard-activity-feed');
    if (!container) return;
    
    // Mock data for the activity feed to make the dashboard feel alive
    const activities = [
        { icon: 'check', color: 'bg-green', text: '<strong>Raphaël AGBOGAN</strong> a validé sa cotisation de 50 000 FCFA.', time: 'Il y a 10 min' },
        { icon: 'clock', color: 'bg-yellow', text: 'Le tour de <strong>Marie</strong> approche dans 2 jours.', time: 'Il y a 2 heures' },
        { icon: 'user-plus', color: 'bg-blue', text: '<strong>Jean</strong> a rejoint la tontine "Projet Vacances".', time: 'Hier à 14h' },
        { icon: 'award', color: 'bg-purple', text: 'La tontine <strong>"Épargne 2026"</strong> a été clôturée avec succès.', time: 'Il y a 2 jours' }
    ];
    
    container.innerHTML = activities.map(act => `
        <div class="activity-item">
            <div class="activity-icon ${act.color}"><i data-feather="${act.icon}"></i></div>
            <div class="activity-content">
                ${act.text}
                <div class="activity-time">${act.time}</div>
            </div>
        </div>
    `).join('');
    
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
};

function animateDonutChart() {
    const donutCircle = document.querySelector('.donut-segment');
    const pctLabel = document.getElementById('donut-percentage');
    if (!donutCircle || !pctLabel) return;

    let targetPct = state.donut.receivedPercent || 0;
    const circumference = 2 * Math.PI * 15.9155;
    const offset = circumference - (targetPct / 100) * circumference;
    donutCircle.style.strokeDashoffset = offset;

    let currentPct = 0;
    const interval = setInterval(() => {
        if (currentPct >= targetPct) clearInterval(interval);
        else {
            currentPct++;
            pctLabel.textContent = currentPct + '%';
        }
    }, 20);
}

// --- 8. HELPERS ---

function toggleActionMenu(event, id) {
    event.stopPropagation();
    // Close all other open dropdowns first
    document.querySelectorAll('.action-dropdown.show').forEach(dropdown => {
        if (dropdown.id !== `dropdown-${id}`) {
            dropdown.classList.remove('show');
        }
    });
    
    // Toggle the targeted dropdown
    const targetDropdown = document.getElementById(`dropdown-${id}`);
    if (targetDropdown) {
        targetDropdown.classList.toggle('show');
    }
}

// Global click listener to close dropdowns when clicking outside
document.addEventListener('click', (event) => {
    if (!event.target.closest('.action-menu-container')) {
        document.querySelectorAll('.action-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }
});
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('tontine_theme', isDark ? 'dark' : 'light');
    const iconMoon = document.querySelector('.icon-moon');
    const iconSun = document.querySelector('.icon-sun');
    if (iconMoon && iconSun) {
        iconMoon.classList.toggle('hidden', isDark);
        iconSun.classList.toggle('hidden', !isDark);
    }
}

function loadThemePreference() {
    const saved = localStorage.getItem('tontine_theme');
    const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        document.body.classList.add('dark-mode');
        const iconMoon = document.querySelector('.icon-moon');
        const iconSun = document.querySelector('.icon-sun');
        if (iconMoon && iconSun) {
            iconMoon.classList.add('hidden');
            iconSun.classList.remove('hidden');
        }
    }
}

async function switchTab(tabId) {
    // Mettre à jour les classes actives sur les boutons du menu
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.toggle('active', nav.getAttribute('data-tab') === tabId);
    });

    // Afficher le bon panneau
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    // Charger et rendre les données selon l'onglet
    switch (tabId) {
        case 'circle':
            await renderCircleTab();
            break;
        case 'members':
            await renderMembersTab();
            break;
        case 'register':
            await renderRegistreTab();
            break;
        case 'messages':
            await renderMessagesTab();
            break;
        case 'notifications':
            await renderNotificationsTab();
            break;
        case 'calendar':
            await renderCalendarTab();
            break;
        case 'reports':
            await renderReportsTab();
            break;
        case 'home':
            await loadDynamicData();
            renderDashboard();
            animateDonutChart();
            break;
    }
}

function playSuccessSound() {
    if (soundSuccess) {
        soundSuccess.currentTime = 0;
        soundSuccess.play().catch(e => console.log("Audio block details:", e));
    }
}

// --- 9. RENDERERS DES ONGLETS SECONDAIRES ---

async function renderCircleTab() {
    const select = document.getElementById('circle-group-select');
    if (!select) return;

    if (!state.activeTontines || state.activeTontines.length === 0) {
        select.innerHTML = '<option value="">Aucune tontine active</option>';
        updateCircleView(null);
        return;
    }

    // Initialize select options if empty or new tontines added
    if (select.options.length === 0 || select.options.length !== state.activeTontines.length) {
        select.innerHTML = '';
        state.activeTontines.forEach(t => {
            select.innerHTML += `<option value="${t.id}">${escapeHTML(t.name)}</option>`;
        });
    }

    // Ensure listener is attached only once
    if (!select.dataset.listenerAttached) {
        select.addEventListener('change', (e) => {
            const selectedTontine = state.activeTontines.find(t => t.id == e.target.value);
            if (selectedTontine) updateCircleView(selectedTontine);
        });
        select.dataset.listenerAttached = 'true';
    }

    // Default to currently selected or first one
    const currentVal = select.value || (state.activeTontines[0] ? state.activeTontines[0].id : null);
    if (currentVal) {
        const initialTontine = state.activeTontines.find(t => t.id == currentVal);
        if (initialTontine) updateCircleView(initialTontine);
    }
}

function updateCircleView(tontine) {
    const title = document.getElementById('circle-title-label');
    const beneficiary = document.getElementById('circle-beneficiary-label');
    const share = document.getElementById('circle-individual-share-label');
    const statusText = document.getElementById('circle-amount-status');
    const progFill = document.getElementById('circle-prog-fill');
    const badge = document.getElementById('circle-badge');

    if (!tontine) {
        if(title) title.textContent = "-";
        if(beneficiary) beneficiary.textContent = "-";
        if(share) share.textContent = "0 FCFA";
        if(statusText) statusText.textContent = "0 / 0 FCFA";
        if(progFill) progFill.style.width = "0%";
        if(badge) badge.textContent = "-";
        return;
    }

    if(title) title.textContent = tontine.name;
    if(beneficiary) beneficiary.textContent = "Tour actuel";
    if(share) share.textContent = tontine.amount.toLocaleString('fr-FR') + " FCFA";
    if(badge) badge.textContent = tontine.status || "En cours";

    const maxM = parseInt(tontine.members.split('/')[1]) || 10;
    const currentM = parseInt(tontine.members.split('/')[0]) || 0;
    const totalExpected = tontine.amount * maxM;
    const currentCollected = tontine.amount * currentM;
    
    if(statusText) statusText.textContent = currentCollected.toLocaleString('fr-FR') + " / " + totalExpected.toLocaleString('fr-FR') + " FCFA";
    
    let progPercent = maxM > 0 ? (currentM / maxM) * 100 : 0;
    if (progPercent > 100) progPercent = 100;
    
    if(progFill) {
        progFill.style.transition = 'width 1s ease-in-out';
        progFill.style.width = progPercent + "%";
    }
}

async function renderMembersTab(searchQuery = '') {
    const grid = document.getElementById('members-full-grid');
    if (!grid) return;
    grid.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';

    let members = await DataService.getMembers().catch(() => []);
    
    if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase();
        members = members.filter(m => {
            const name = (m.name || m.full_name || '').toLowerCase();
            const role = (m.role || m.status || '').toLowerCase();
            return name.includes(lowerQ) || role.includes(lowerQ);
        });
    }

    if (!members || members.length === 0) {
        grid.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Aucun membre trouvé.</p>';
        return;
    }

    grid.innerHTML = members.map(m => {
        const name  = m.name || m.full_name || 'Membre';
        const role  = m.role  || m.status  || 'Membre';
        const trust = m.trust !== undefined ? m.trust : (m.reliability_score || 0);
        const avatar = m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=5C60F5&color=fff`;
        const trustClass = trust >= 90 ? 'excellent' : trust >= 75 ? 'good' : 'fair';
        const trustLabel = trust >= 90 ? 'Excellent' : trust >= 75 ? 'Bien'   : 'Moyen';
        const contributed = m.contributed !== undefined
            ? new Intl.NumberFormat('fr-FR').format(m.contributed) + ' FCFA'
            : '—';
        return `
        <div class="member-card">
            <img src="${avatar}" alt="${name}" class="member-av"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=5C60F5&color=fff'">
            <div class="member-info">
                <div class="member-name">${name}</div>
                <div class="member-role">${role}</div>
            </div>
            <div class="member-trust ${trustClass}">${trustLabel} (${trust}%)</div>
            <div class="member-contributed">${contributed}</div>
        </div>`;
    }).join('');
}

async function renderRegistreTab() {
    const tbody = document.getElementById('master-registry-table-body');
    if (!tbody) return;
    
    // Utiliser les transactions locales (qui incluent les paiements récents sans recharger)
    const transactions = state.transactions || [];
    
    if (transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 60px 20px; text-align: center;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
                <div style="background:rgba(245, 158, 11, 0.1); color:#F59E0B; width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                    <i data-feather="activity" style="width:32px; height:32px;"></i>
                </div>
                <div>
                    <h3 style="color:var(--text-1); font-size:18px; font-weight:700; margin-bottom:4px;">Aucune transaction</h3>
                    <p style="color:var(--text-3); font-size:14px; max-width:300px; margin:0 auto;">L'historique des cotisations et des retraits apparaîtra ici une fois que votre tontine sera active.</p>
                </div>
            </div>
        </td></tr>`;
        setTimeout(() => feather.replace(), 0);
        return;
    }

    tbody.innerHTML = transactions.map(tx => {
        const isDeposit = tx.type === 'deposit';
        const badgeClass = isDeposit ? 'badge-green' : 'badge-red';
        const badgeLabel = isDeposit ? 'Cotisation' : 'Retrait';
        return `
        <tr>
            <td>${tx.date || '-'}</td>
            <td>${tx.tontine || 'Épargne'}</td>
            <td>${tx.title || '-'}</td>
            <td><span class="badge-status ${badgeClass}">${badgeLabel}</span></td>
            <td style="font-weight:600">${(tx.amount || 0).toLocaleString('fr-FR')} FCFA</td>
            <td><span class="badge-status badge-green">Validé</span></td>
            <td>
                <div class="action-menu-container" style="position:relative;">
                    <button class="btn-action-dots" onclick="toggleTxDropdown('${tx.id}')" style="font-size:18px;">&#8942;</button>
                    <div id="dropdown-tx-${tx.id}" class="dropdown-menu hidden" style="position:absolute; right:0; top:100%; background:white; border:1px solid #e2e8f0; border-radius:6px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); z-index:10; min-width:120px; text-align:left;">
                        <button style="display:block; width:100%; text-align:left; padding:8px 12px; background:none; border:none; color:#ef4444; font-size:13px; cursor:pointer;" onclick="deleteTransaction('${tx.id}')">Supprimer</button>
                    </div>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

window.toggleTxDropdown = function(id) {
    document.querySelectorAll('[id^="dropdown-tx-"]').forEach(d => {
        if (d.id !== 'dropdown-tx-' + id) d.classList.add('hidden');
    });
    const drop = document.getElementById('dropdown-tx-' + id);
    if (drop) drop.classList.toggle('hidden');
};

window.deleteTransaction = function(id) {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette transaction de l'historique ?")) {
        // Supprimer du state
        state.transactions = state.transactions.filter(tx => tx.id !== id);
        
        // Mettre à jour le localStorage pour la persistance locale
        let demoTxs = JSON.parse(localStorage.getItem('demo_transactions') || '[]');
        demoTxs = demoTxs.filter(tx => tx.id !== id);
        localStorage.setItem('demo_transactions', JSON.stringify(demoTxs));
        
        // Rafraîchir la vue
        renderRegistreTab();
        showToast("Transaction supprimée avec succès", "success");
    }
};

async function renderMessagesTab() {
    const convList = document.getElementById('conversations-list');
    if (!convList) return;
    convList.innerHTML = '<p style="padding:16px;color:var(--color-text-muted);font-size:13px">Chargement...</p>';

    const messages = await DataService.getRecentMessages().catch(() => []);
    if (!messages || messages.length === 0) {
        convList.innerHTML = '<p style="padding:16px;color:var(--color-text-muted);font-size:13px">Aucun message.</p>';
        return;
    }

    convList.innerHTML = messages.map(msg => {
        const icon = msg.type === 'group' ? 'users' : msg.type === 'system' ? 'bell' : 'user';
        const safeSender = escapeHTML(msg.sender).replace(/'/g, "\\'");
        const memberCount = msg.type === 'group' ? (extendedMembers.length > 0 ? extendedMembers.length : 10) : 1;
        const countText = msg.type === 'group' ? `${memberCount} membres &middot; En ligne` : `En ligne`;

        return `
        <div class="conv-item" style="cursor:pointer" onclick="document.getElementById('chat-title').textContent='${safeSender}'; document.getElementById('chat-members-count').innerHTML='${countText}';">
            <div class="msg-avatar ${msg.type}" style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${icon === 'users'
                        ? '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
                        : icon === 'bell'
                        ? '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'
                        : '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'}
                </svg>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(msg.sender)}</div>
                <div style="font-size:12px;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(msg.text)}</div>
            </div>
            <div style="font-size:11px;color:var(--color-text-muted);flex-shrink:0">${msg.time}</div>
        </div>`;
    }).join('');
}

function updateNotifBadges(notifs) {
    const unreadCount = notifs.filter(n => !n.read).length;
    document.querySelectorAll('.tb-badge, .menu-badge').forEach(badge => {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
    });
}

async function renderNotificationsTab() {
    const feed = document.getElementById('notifications-feed');
    if (!feed) return;
    feed.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';

    if (!state.notifs) {
        let notifs = await DataService.getNotifications().catch(() => []);
        // Fallback : 12 notifications mockées si Supabase ne renvoie rien
        if (!notifs || notifs.length === 0) {
            notifs = [
                { type: 'payment', title: 'Cotisation reçue — Awa Diop (35 000 FCFA)',        created_at: new Date(Date.now() - 1  * 3600000).toISOString(), read: false },
                { type: 'payment', title: 'Cotisation reçue — Moussa Koné (35 000 FCFA)',      created_at: new Date(Date.now() - 2  * 3600000).toISOString(), read: false },
                { type: 'round',   title: 'Tour #3 — Clôture dans 2 jours (Dév. 2024)',        created_at: new Date(Date.now() - 3  * 3600000).toISOString(), read: false },
                { type: 'payment', title: 'Retard signalé — Jean Dupont',                       created_at: new Date(Date.now() - 5  * 3600000).toISOString(), read: true  },
                { type: 'system',  title: 'Nouvelle tontine créée : Aide Familiale',            created_at: new Date(Date.now() - 8  * 3600000).toISOString(), read: true  },
                { type: 'round',   title: 'Bénéficiaire désigné — Prochain tour : Awa Diop',   created_at: new Date(Date.now() - 12 * 3600000).toISOString(), read: true  },
                { type: 'payment', title: 'Paiement validé — 35 000 FCFA par Koffi Alain',    created_at: new Date(Date.now() - 24 * 3600000).toISOString(), read: true  },
                { type: 'system',  title: 'Rappel : Échéance du 18 Juillet 2026',              created_at: new Date(Date.now() - 30 * 3600000).toISOString(), read: true  },
                { type: 'round',   title: 'Tour #2 clôturé avec succès',                       created_at: new Date(Date.now() - 48 * 3600000).toISOString(), read: true  },
                { type: 'payment', title: 'Paiement Mobile Money confirmé',                    created_at: new Date(Date.now() - 52 * 3600000).toISOString(), read: true  },
                { type: 'system',  title: 'Membre invité : Fatou Bah a rejoint Aide Familiale',created_at: new Date(Date.now() - 60 * 3600000).toISOString(), read: true  },
                { type: 'system',  title: 'Rapport mensuel de Juin 2026 disponible',           created_at: new Date(Date.now() - 72 * 3600000).toISOString(), read: true  },
            ];
        }
        state.notifs = notifs;
    }
    
    const notifs = state.notifs;
    
    // Toujours mettre à jour les badges globaux à chaque rendu
    updateNotifBadges(notifs);

    // Filtrage par onglet actif
    const activeFilter = document.querySelector('.notif-tab-btn.active');
    const filter = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
    const filtered = filter === 'all' ? notifs : notifs.filter(n => n.type === filter);

    // Wiring des boutons de filtre
    document.querySelectorAll('.notif-tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.notif-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderNotificationsTab();
        };
    });

    // Bouton « Tout marquer lu »
    const btnMarkRead = document.getElementById('btn-mark-all-read');
    if (btnMarkRead) {
        btnMarkRead.onclick = async () => {
            // Marquer local
            notifs.forEach(n => n.read = true);
            updateNotifBadges(notifs);

            // Mettre à jour Supabase si connecté
            if (DataService.isConnected()) {
                const client = window.SupabaseService && window.SupabaseService.getClient ? window.SupabaseService.getClient() : null;
                if (client) {
                    await client.from('notifications')
                        .update({ is_read: true })
                        .eq('is_read', false)
                        .catch(e => console.warn('[Notifs] Erreur mise à jour:', e));
                }
            }
            renderNotificationsTab();
        };
    }

    if (filtered.length === 0) {
        feed.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Aucune notification dans cette catégorie.</p>';
        return;
    }

    const icons = {
        payment: '<polyline points="20 6 9 17 4 12"/>',
        round:   '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        system:  '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'
    };
    const colors = { payment: '#10B981', round: '#F59E0B', system: '#5C60F5' };

    feed.innerHTML = filtered.map((n, i) => {
        const iconPath = icons[n.type]  || icons.system;
        const color    = colors[n.type] || '#5C60F5';
        const date     = n.created_at ? new Date(n.created_at).toLocaleString('fr-FR', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
        return `
        <div class="notif-item${n.read ? '' : ' unread'}" data-index="${i}" style="cursor:${n.read ? 'default' : 'pointer'};display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border-bottom:1px solid var(--border);transition:background .2s">
            <div style="width:36px;height:36px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><${iconPath}/></svg>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:${n.read ? '400' : '600'};color:var(--text-1)">${n.title}</div>
                ${date ? `<div style="font-size:11px;color:var(--text-3);margin-top:3px">${date}</div>` : ''}
            </div>
            ${!n.read ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:4px"></span>' : ''}
        </div>`;
    }).join('');

    // Ajouter l'écouteur de clic pour marquer chaque notification comme lue individuellement
    feed.querySelectorAll('.notif-item').forEach((el, idx) => {
        el.onclick = async () => {
            const n = filtered[idx];
            if (n.read) return; // Déjà lu
            
            // Marquer comme lu localement
            n.read = true;
            updateNotifBadges(notifs);
            
            // Mettre à jour dans Supabase (si l'objet a un ID et qu'on est connecté)
            if (n.id && DataService.isConnected()) {
                const client = window.SupabaseService && window.SupabaseService.getClient ? window.SupabaseService.getClient() : null;
                if (client) {
                    await client.from('notifications')
                        .update({ is_read: true })
                        .eq('id', n.id)
                        .catch(e => console.warn('[Notifs] Erreur maj item:', e));
                }
            }
            
            // Rafraîchir l'affichage
            renderNotificationsTab();
        };
    });
}

async function renderReportsTab() {
    const barChart  = document.getElementById('bar-chart-monthly');
    const breakdown = document.getElementById('tontine-breakdown-list');
    const performers= document.getElementById('top-performers-grid');

    if (barChart)   barChart.innerHTML   = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';
    if (breakdown)  breakdown.innerHTML  = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';
    if (performers) performers.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';

    const data = await DataService.getReportsData().catch(() => null);

    if (!data) {
        const msg = '<p style="padding:20px;color:var(--color-text-muted)">Données non disponibles (mode démo).</p>';
        if (barChart)   barChart.innerHTML   = msg;
        if (breakdown)  breakdown.innerHTML  = msg;
        if (performers) performers.innerHTML = msg;
        return;
    }

    // Graphique en barres mensuel
    if (barChart && data.chartData && data.chartData.labels.length > 0) {
        const max = Math.max(...data.chartData.dataPoints, 1);
        barChart.innerHTML = `
            <div style="display:flex;align-items:flex-end;gap:8px;height:160px;padding:10px 0">
                ${data.chartData.labels.map((label, i) => {
                    const h = Math.round((data.chartData.dataPoints[i] / max) * 140);
                    return `
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <div style="font-size:10px;color:var(--color-text-muted)">${new Intl.NumberFormat('fr-FR', {notation:'compact'}).format(data.chartData.dataPoints[i])}</div>
                        <div style="width:100%;background:linear-gradient(180deg,#5C60F5,#818CF8);border-radius:4px 4px 0 0;height:${h}px;min-height:4px;transition:height 0.6s ease"></div>
                        <div style="font-size:10px;color:var(--color-text-muted);text-align:center">${label.slice(5)}</div>
                    </div>`;
                }).join('')}
            </div>`;
    } else if (barChart) {
        barChart.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Aucune donnée.</p>';
    }

    // Répartition par tontine
    if (breakdown) {
        breakdown.innerHTML = state.activeTontines.map(t => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border)">
                <span style="font-weight:500">${t.name}</span>
                <span style="color:var(--color-primary);font-weight:600">${new Intl.NumberFormat('fr-FR').format(t.amount)} FCFA</span>
            </div>`).join('') || '<p style="color:var(--color-text-muted)">—</p>';
    }

    // Top Performers (mockés si pas de données)
    if (performers) {
        performers.innerHTML = extendedMembers.slice(0, 3).map((m, i) => {
            const name  = m.name || m.full_name || 'Membre';
            const avatar = m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=5C60F5&color=fff`;
            const medals = ['🥇','🥈','🥉'];
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--color-surface);border-radius:var(--radius-md);border:1px solid var(--color-border)">
                <span style="font-size:22px">${medals[i]}</span>
                <img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover" alt="${name}">
                <div>
                    <div style="font-weight:600;font-size:13px">${name}</div>
                    <div style="font-size:12px;color:var(--color-text-muted)">${m.role || 'Membre'}</div>
                </div>
            </div>`;
        }).join('');
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', init);

// --- 10. CALENDRIER ---
async function renderCalendarTab() {
    const grid        = document.getElementById('calendar-grid');
    const monthTitle  = document.getElementById('cal-month-title');
    const eventsList  = document.getElementById('upcoming-events-list');
    if (!grid) return;

    // État du calendrier (mois courant)
    if (!window._calState) {
        const now = new Date();
        window._calState = { year: now.getFullYear(), month: now.getMonth() };
    }
    const { year, month } = window._calState;

    const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    if (monthTitle) monthTitle.textContent = `${MONTHS_FR[month]} ${year}`;

    // Navigation prev/next
    const btnPrev = document.getElementById('btn-cal-prev');
    const btnNext = document.getElementById('btn-cal-next');
    if (btnPrev) btnPrev.onclick = () => {
        window._calState.month--;
        if (window._calState.month < 0) { window._calState.month = 11; window._calState.year--; }
        renderCalendarTab();
    };
    if (btnNext) btnNext.onclick = () => {
        window._calState.month++;
        if (window._calState.month > 11) { window._calState.month = 0; window._calState.year++; }
        renderCalendarTab();
    };

    // Générer les jours du mois
    const firstDay   = new Date(year, month, 1).getDay();   // 0=Dim
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today       = new Date();

    // Récupérer les événements depuis les tontines actives
    const tontines = await DataService.getTontines().catch(() => []);
    const events = {}; // { 'YYYY-MM-DD': [{label, tontine}] }

    tontines.forEach(t => {
        // Simuler une date de prochain tour (aujourd'hui + index * 7 jours)
        const idx = state.activeTontines.indexOf(t);
        const d = new Date(year, month, 12 + idx * 7);
        if (d.getMonth() === month && d.getFullYear() === year) {
            const key = d.toISOString().split('T')[0];
            if (!events[key]) events[key] = [];
            events[key].push({ label: `Tour: ${t.name}`, tontine: t });
        }
    });

    // Grille
    let html = '';
    // Cellules vides avant le 1er
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr  = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday  = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const hasEvent = events[dateStr];
        html += `
        <div class="cal-cell${isToday ? ' today' : ''}${hasEvent ? ' has-event' : ''}" title="${hasEvent ? hasEvent.map(e=>e.label).join(', ') : ''}">
            <span class="cal-day-num">${d}</span>
            ${hasEvent ? `<div class="cal-event-dot" style="width:6px;height:6px;border-radius:50%;background:#5C60F5;margin:2px auto 0"></div>` : ''}
        </div>`;
    }
    grid.innerHTML = html;

    // Événements à venir
    if (eventsList) {
        const upcoming = Object.entries(events)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 5);

        if (upcoming.length === 0) {
            eventsList.innerHTML = '<p style="padding:12px;color:var(--color-text-muted);font-size:13px">Aucun événement ce mois-ci.</p>';
        } else {
            eventsList.innerHTML = upcoming.map(([dateKey, evts]) => {
                const d = new Date(dateKey);
                const label = d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
                return `
                <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border)">
                    <div style="background:#5C60F520;border-radius:8px;padding:6px 10px;text-align:center;min-width:44px">
                        <div style="font-size:16px;font-weight:700;color:#5C60F5">${d.getDate()}</div>
                        <div style="font-size:10px;color:var(--color-text-muted);text-transform:uppercase">${MONTHS_FR[d.getMonth()].slice(0,3)}</div>
                    </div>
                    <div style="flex:1">
                        ${evts.map(e => `<div style="font-size:13px;font-weight:500">${e.label}</div>`).join('')}
                        <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">${label}</div>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

// --- 11. FAQ ACCORDÉON (appelée via onclick dans le HTML) ---
function toggleFaq(btn) {
    const answer  = btn.nextElementSibling;
    const allAnswers = document.querySelectorAll('.faq-answer');
    const allBtns    = document.querySelectorAll('.faq-question');

    // Fermer tous les autres
    allAnswers.forEach((a, i) => {
        if (a !== answer) {
            a.style.maxHeight = '0px';
            a.style.paddingTop    = '0';
            a.style.paddingBottom = '0';
            allBtns[i].classList.remove('open');
        }
    });

    // Toggle courant
    const isOpen = answer.style.maxHeight && answer.style.maxHeight !== '0px';
    if (!isOpen) {
        answer.style.maxHeight = '500px'; // Suffisamment grand pour englober le texte
        answer.style.paddingTop    = '16px';
        answer.style.paddingBottom = '16px';
        btn.classList.add('open');
    } else {
        answer.style.maxHeight    = '0px';
        answer.style.paddingTop   = '0';
        answer.style.paddingBottom = '0';
        btn.classList.remove('open');
    }
}

// --- FIX ABSOLU DU BOUTON PAIEMENTS ---
// Attaché directement au chargement du script pour éviter tout conflit avec init()
const explicitBtnPayments = document.getElementById('btn-menu-payments');
const explicitSubmenu = document.getElementById('payments-submenu');
if (explicitBtnPayments && explicitSubmenu) {
    explicitBtnPayments.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        explicitSubmenu.classList.toggle('hidden');
        const isOpen = !explicitSubmenu.classList.contains('hidden');
        this.classList.toggle('active', isOpen);
        
        const chevron = this.querySelector('.chevron-icon');
        if (chevron) {
            chevron.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    };
}

// Clic sur "Envoyer un paiement" du sous-menu -> Ouvre le modal de paiement existant
const btnSubmenuSendPayment = document.getElementById('btn-submenu-send-payment');
if (btnSubmenuSendPayment) {
    btnSubmenuSendPayment.addEventListener('click', () => {
        const btnQuickVal = document.getElementById('btn-quick-validate-pay');
        if (btnQuickVal) btnQuickVal.click();
    });
}

// --- RECHERCHE GLOBALE ---
const globalSearchInput = document.getElementById('global-search-input');
const searchResultsDropdown = document.getElementById('search-results-dropdown');

if (globalSearchInput && searchResultsDropdown) {
    globalSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (query.length === 0) {
            searchResultsDropdown.style.display = 'none';
            return;
        }
        
        searchResultsDropdown.style.display = 'block';
        
        let html = '';
        
        // Recherche dans les membres
        const matchedMembers = extendedMembers.filter(m => m.name.toLowerCase().includes(query));
        if (matchedMembers.length > 0) {
            html += '<div style="padding: 8px 12px; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Membres</div>';
            matchedMembers.forEach(m => {
                html += `
                    <div style="padding: 8px 12px; display: flex; align-items: center; gap: 10px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'" onclick="switchTab('members')">
                        <img src="${m.avatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                        <div>
                            <div style="font-size: 13px; color: #1e293b; font-weight: 500;">${m.name}</div>
                            <div style="font-size: 11px; color: #64748b;">${m.role}</div>
                        </div>
                    </div>
                `;
            });
        }
        
        // Recherche dans les tontines
        const matchedTontines = state.activeTontines.filter(t => t.name.toLowerCase().includes(query));
        if (matchedTontines.length > 0) {
            html += '<div style="padding: 8px 12px; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-top: ' + (matchedMembers.length > 0 ? 'none' : '1px solid #e2e8f0') + ';">Tontines</div>';
            matchedTontines.forEach(t => {
                html += `
                    <div style="padding: 8px 12px; display: flex; flex-direction: column; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'" onclick="switchTab('circle')">
                        <div style="font-size: 13px; color: #1e293b; font-weight: 500;">${t.name}</div>
                        <div style="font-size: 11px; color: #64748b;">${t.amount.toLocaleString()} FCFA - ${t.frequency}</div>
                    </div>
                `;
            });
        }
        
        if (matchedMembers.length === 0 && matchedTontines.length === 0) {
            html = '<div style="padding: 12px; font-size: 13px; color: #64748b; text-align: center;">Aucun résultat trouvé</div>';
        }
        
        searchResultsDropdown.innerHTML = html;
    });
}

// --- GESTION DU CHAT (ONGLET MESSAGES) ---
const btnSendChatMessage = document.getElementById('btn-send-chat-message');
const chatMessageInput = document.getElementById('chat-message-input');
const chatMessagesArea = document.getElementById('chat-messages-area');

if (btnSendChatMessage && chatMessageInput) {
    btnSendChatMessage.addEventListener('click', async () => {
        const cont = chatMessageInput.value.trim();
        if (!cont) return;

        btnSendChatMessage.disabled = true;
        btnSendChatMessage.textContent = "Envoi...";

        // On utilise la même méthode que pour le bouton rapide (envoi global par défaut)
        const res = await DataService.createMessage({ conversation_id: null, content: cont });

        btnSendChatMessage.disabled = false;
        btnSendChatMessage.textContent = "Envoyer";

        if (res && !res.error) {
            chatMessageInput.value = '';
            
            // Ajouter le message visuellement dans la zone de chat
            if (chatMessagesArea) {
                const now = new Date();
                const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                const msgHTML = `
                    <div style="display: flex; flex-direction: column; align-items: flex-end; margin-bottom: 15px;">
                        <div style="background: var(--primary); color: white; padding: 10px 14px; border-radius: 12px 12px 0 12px; font-size: 13px; max-width: 80%; line-height: 1.4; box-shadow: var(--shadow);">
                            ${cont}
                        </div>
                        <div style="font-size: 10px; color: var(--text-3); margin-top: 4px;">Aujourd'hui à ${timeStr}</div>
                    </div>
                `;
                chatMessagesArea.innerHTML += msgHTML;
                chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
            }

            if (typeof playSuccessSound === 'function') {
                playSuccessSound();
            } else if (typeof soundSuccess !== 'undefined' && soundSuccess) {
                soundSuccess.volume = 0.5;
                soundSuccess.play().catch(() => {});
            }
            
            // Mettre à jour la liste des conversations (à gauche)
            await loadDynamicData();
            if (typeof renderMessagesTab === 'function') {
                renderMessagesTab();
            }
        } else {
            let errorMsg = res ? res.error : "Erreur inconnue";
            if (typeof errorMsg === 'object' && errorMsg !== null) {
                errorMsg = errorMsg.message || JSON.stringify(errorMsg);
            }
            alert("Erreur lors de l'envoi : " + errorMsg);
        }
    });

    chatMessageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnSendChatMessage.click();
        }
    });
}

// --- BOUTON "+" NOUVELLE CONVERSATION ---
const btnNewConv = document.querySelector('.btn-new-conv');
if (btnNewConv) {
    btnNewConv.addEventListener('click', () => {
        // Simuler le clic sur le bouton "Envoyer message" des actions rapides
        const btnQuickSendMsg = document.getElementById('btn-quick-send-msg');
        if (btnQuickSendMsg) {
            btnQuickSendMsg.click();
        } else {
            // Repli : ouvrir directement le modal si le bouton rapide n'est pas dispo
            const m = document.getElementById('send-message-modal');
            if (m) {
                const s = document.getElementById('message-recipient-input');
                if (s && state.activeTontines) {
                    s.innerHTML = '<option value="">Sélectionnez un destinataire</option>';
                    state.activeTontines.forEach(t => {
                        s.innerHTML += `<option value="${t.name}">Groupe: ${t.name}</option>`;
                    });
                }
                m.classList.remove('hidden');
            }
        }
    });
}
// Trigger Live Server 3

// --- GESTION DU FILTRE DE PÉRIODE POUR LE GRAPHIQUE DES RAPPORTS ---
window.toggleCustomDates = function(period) {
    const customDiv = document.getElementById('custom-date-filters');
    if (customDiv) {
        customDiv.style.display = period === 'custom' ? 'flex' : 'none';
    }
};

window.applyChartPeriod = function() {
    if (!reportsChartInstance) return;

    const periodSelect = document.getElementById('report-period-filter');
    if (!periodSelect) return;
    const period = periodSelect.value;

    let labels = [];
    let dataPoints = [];

    switch(period) {
        case '1w':
            labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
            dataPoints = [15000, 42000, 30000, 85000, 60000, 95000, 40000];
            break;
        case '1m':
            labels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'];
            dataPoints = [120000, 90000, 210000, 150000];
            break;
        case '6m':
            labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août'];
            dataPoints = [120000, 210000, 160000, 280000, 190000, 310000, 240000, 350000];
            break;
        case '1y':
            labels = ['T1 2025', 'T2 2025', 'T3 2025', 'T4 2025', 'T1 2026', 'T2 2026'];
            dataPoints = [450000, 680000, 520000, 890000, 1200000, 950000];
            break;
        case 'custom':
            const dStart = document.getElementById('report-date-start')?.value || 'Début';
            const dEnd = document.getElementById('report-date-end')?.value || 'Fin';
            labels = [dStart, '...', '...', '...', '...', dEnd];
            dataPoints = [50000, 120000, 80000, 190000, 110000, 240000];
            break;
        default:
            return;
    }

    // Mise à jour de l'instance Chart.js
    reportsChartInstance.data.labels = labels;
    reportsChartInstance.data.datasets[0].data = dataPoints;
    reportsChartInstance.update();
};

// --- AXE 3 : EXPORTS & RELANCES ---

window.exportTontineToPDF = function() {
    const tontineName = document.getElementById('details-tontine-name').textContent;
    const tontineAmount = document.getElementById('details-tontine-amount').textContent;
    const tontineStatus = document.getElementById('details-tontine-status').textContent;
    const tontineMembers = document.getElementById('details-tontine-members').textContent;

    const element = document.createElement('div');
    element.innerHTML = `
        <div style="padding: 40px; font-family: 'Inter', sans-serif; color: #1E293B;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #0B1F4D; font-size: 28px; font-weight: bold; margin: 0;">Tontine Pro</h1>
                <p style="color: #64748B; font-size: 14px; margin-top: 5px;">Rapport de Tontine</p>
            </div>
            
            <div style="border-bottom: 2px solid #E2E8F0; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="font-size: 20px; color: #1E293B; margin: 0;">${tontineName}</h2>
                <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; background: #E0F2FE; color: #0284C7; font-size: 12px; margin-top: 8px;">${tontineStatus}</span>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; width: 40%;">Montant par cycle</td>
                    <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; color: #1E293B; font-weight: 600; text-align: right;">${tontineAmount}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; color: #64748B;">Membres inscrits</td>
                    <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; color: #1E293B; font-weight: 600; text-align: right;">${tontineMembers}</td>
                </tr>
            </table>

            <div style="margin-top: 40px; text-align: center; color: #94A3B8; font-size: 12px;">
                <p>Généré automatiquement par Tontine Pro le ${new Date().toLocaleDateString('fr-FR')}</p>
            </div>
        </div>
    `;

    const opt = {
      margin:       1,
      filename:     'Rapport_' + tontineName.replace(/\s+/g, '_') + '.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    if (typeof showGlobalLoader === 'function') showGlobalLoader();
    if (window.html2pdf) {
        html2pdf().set(opt).from(element).save().then(() => {
            if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
            if (typeof showToast === 'function') showToast("Le rapport PDF a été téléchargé avec succès !");
            else alert("Le rapport PDF a été téléchargé avec succès !");
        });
    } else {
        if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
        alert("Erreur: La bibliothèque d'export PDF n'est pas chargée.");
    }
};

window.sendReminder = function(memberName, method) {
    if (method === 'whatsapp') {
        const text = encodeURIComponent(`👋 Bonjour ${memberName}, c'est un rappel automatique de Tontine Pro. Vous avez une cotisation en retard. Merci de régulariser la situation dès que possible !`);
        window.open('https://wa.me/?text=' + text, '_blank');
        if (typeof showToast === 'function') showToast(`Relance WhatsApp préparée pour ${memberName}`);
    } else {
        if (typeof showToast === 'function') showToast(`Email de relance envoyé à ${memberName} !`);
    }
};

function renderMembers() {
    const grid = document.getElementById('members-full-grid');
    if (!grid) return;

    const fakeMembers = [
        { name: 'Kossi A.', role: 'Membre actif', status: 'À jour', tontines: 2, amount: '50 000 FCFA' },
        { name: 'Awa N.', role: 'Membre actif', status: 'En retard', tontines: 1, amount: '25 000 FCFA' },
        { name: 'Jean-Paul', role: 'Membre actif', status: 'À jour', tontines: 3, amount: '150 000 FCFA' },
        { name: 'Fatou D.', role: 'Membre actif', status: 'En retard', tontines: 1, amount: '10 000 FCFA' },
        { name: 'David M.', role: 'Administrateur', status: 'À jour', tontines: 2, amount: '100 000 FCFA' },
        { name: 'Sophie L.', role: 'Membre actif', status: 'À jour', tontines: 1, amount: '25 000 FCFA' }
    ];

    grid.innerHTML = fakeMembers.map(m => {
        const isLate = m.status === 'En retard';
        const badgeClass = isLate ? 'badge-red' : 'badge-green';
        
        const actionBtn = isLate ? 
            `<button onclick="sendReminder('${m.name}', 'whatsapp')" style="background: #25D366; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;" onmouseover="this.style.transform='translateY(-2px)';" onmouseout="this.style.transform='translateY(0)';"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> Relancer</button>` : 
            `<button style="background: var(--bg-hover); color: var(--text-2); border: 1px solid var(--border); padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='var(--border)';" onmouseout="this.style.background='var(--bg-hover)';">Voir profil</button>`;

        return `
            <div style="background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 15px; display: flex; flex-direction: column; gap: 15px; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 10px 15px -3px rgba(0, 0, 0, 0.05)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(92, 96, 245, 0.1); display: flex; align-items: center; justify-content: center; font-weight: bold; color: var(--primary); font-size: 16px;">
                            ${m.name.charAt(0)}
                        </div>
                        <div>
                            <div style="font-weight: 600; color: var(--text-1); font-size: 14px;">${m.name}</div>
                            <div style="font-size: 12px; color: var(--text-3);">${m.role}</div>
                        </div>
                    </div>
                    <span class="badge-status ${badgeClass}" style="font-size: 11px;">${m.status}</span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                    <div style="background: var(--content-bg); padding: 10px; border-radius: 8px; text-align: center;">
                        <div style="color: var(--text-3); font-size: 11px; margin-bottom: 2px;">Tontines</div>
                        <div style="font-weight: 600; color: var(--text-1);">${m.tontines}</div>
                    </div>
                    <div style="background: var(--content-bg); padding: 10px; border-radius: 8px; text-align: center;">
                        <div style="color: var(--text-3); font-size: 11px; margin-bottom: 2px;">Total cotisé</div>
                        <div style="font-weight: 600; color: var(--text-1);">${m.amount}</div>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 15px; margin-top: auto;">
                    ${actionBtn}
                </div>
            </div>
        `;
    }).join('');
}

// --- VISITE GUIDÉE (ONBOARDING) ---
function startOnboardingTour() {
    // Éviter de lancer plusieurs fois
    if (document.getElementById('onboarding-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.8)';
    overlay.style.zIndex = '9998';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.backdropFilter = 'blur(4px)';

    const modal = document.createElement('div');
    modal.style.backgroundColor = 'var(--card)';
    modal.style.padding = '30px';
    modal.style.borderRadius = '16px';
    modal.style.maxWidth = '400px';
    modal.style.textAlign = 'center';
    modal.style.zIndex = '9999';
    modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';

    modal.innerHTML = `
        <div style="background: rgba(92, 96, 245, 0.1); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: var(--text-1); margin-bottom: 10px;">Bienvenue sur Tontine Pro ! 🎉</h2>
        <p style="font-size: 14px; color: var(--text-2); margin-bottom: 25px; line-height: 1.6;">
            Gérez vos cercles d'épargne comme un pro. <br><br>
            Utilisez le menu à gauche pour naviguer, commencez par créer votre première tontine, et suivez vos paiements en temps réel.
        </p>
        <button id="btn-end-tour" class="btn-primary" style="width: 100%; padding: 12px; font-size: 15px;">Démarrer l'expérience</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('btn-end-tour').addEventListener('click', () => {
        document.body.removeChild(overlay);
        localStorage.setItem('tontine_onboarding_done', 'true');
        // Jouer un petit son de succès si possible
        if (typeof playSuccessSound === 'function') playSuccessSound();
    });
}
