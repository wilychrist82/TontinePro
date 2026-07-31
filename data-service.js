/* ==========================================
   Tontine Pro - Data Service Layer
   ==========================================
   Ce service orchestre la récupération des données:
   1. Essaie d'abord Supabase (données réelles)
   2. Retombe sur les données mockées (state) si Supabase échoue
   ========================================== */

const DataService = (() => {

    // ─── Statut de connexion Supabase ────────────────────────────────────────
    let isSupabaseConnected = false;
    let connectionChecked = false;
    let isDemoMode = false;

    /**
     * Initialise la connexion Supabase et affiche le badge de statut.
     */
    async function init() {
        if (typeof window.SupabaseService === 'undefined') {
            console.warn('[DataService] SupabaseService non disponible. Mode offline activé.');
            showConnectionStatus(false);
            return;
        }

        try {
            isSupabaseConnected = await window.SupabaseService.testConnection();
        } catch (e) {
            isSupabaseConnected = false;
        }

        connectionChecked = true;
        isDemoMode = !isSupabaseConnected;
        showConnectionStatus(isSupabaseConnected);

        if (isSupabaseConnected) {
            console.log('[DataService] Mode LIVE - données depuis Supabase.');
        } else {
            console.log('[DataService] Mode LECTURE SEULE / DEMO - données non accessibles.');
            // Activer des restrictions UI si nécessaire (exemple simple)
            document.body.classList.add('readonly-mode');
        }
    }

    /**
     * Affiche un badge de statut de connexion dans le header.
     */
    function showConnectionStatus(connected) {
        // Remove old badge if exists
        const old = document.getElementById('supabase-status-badge');
        if (old) old.remove();

        const badge = document.createElement('div');
        badge.id = 'supabase-status-badge';
        badge.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 8px 14px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            z-index: 9999;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: 'Outfit', sans-serif;
        `;

        if (connected) {
            badge.style.background = 'rgba(16, 185, 129, 0.15)';
            badge.style.color = '#10B981';
            badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            badge.innerHTML = `
                <span style="width:7px;height:7px;border-radius:50%;background:#10B981;display:inline-block;animation:pulse-green 2s infinite;"></span>
                Supabase Connecté
            `;
        } else {
            badge.style.background = 'rgba(245, 158, 11, 0.12)';
            badge.style.color = '#F59E0B';
            badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            badge.innerHTML = `
                <span style="width:7px;height:7px;border-radius:50%;background:#F59E0B;display:inline-block;"></span>
                Mode Démo
            `;
        }

        // Auto-hide après 5 secondes
        document.body.appendChild(badge);
        setTimeout(() => {
            badge.style.opacity = '0';
            badge.style.transform = 'translateY(10px)';
            setTimeout(() => badge.remove(), 500);
        }, 5000);

        // CSS animation for pulse
        if (!document.getElementById('supabase-status-styles')) {
            const style = document.createElement('style');
            style.id = 'supabase-status-styles';
            style.textContent = `
                @keyframes pulse-green {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.3); }
                }
                #supabase-status-badge:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.2) !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ─── Data Getters avec Fallback ──────────────────────────────────────────

    /**
     * Charge les tontines actives depuis Supabase ou le state local.
     * @returns {Array} Liste des tontines
     */
    async function getTontines() {
        if (isSupabaseConnected && window.SupabaseService) {
            const dbData = await window.SupabaseService.fetchTontines();
            if (dbData) {
                return dbData.map(t => ({
                    id: t.id,
                    name: t.name,
                    amount: t.amount_per_cycle,
                    frequency: t.frequency,
                    members: `${t.current_members || 0}/${t.max_members || 10}`,
                    progression: t.progression || 0,
                    status: t.status,
                    isDrawOfficial: t.is_draw_official,
                    certTime: t.cert_time,
                    drawOrder: t.draw_order,
                    type: t.type || 'Rotative',
                    goalAmount: t.goal_amount || 0,
                    goalTitle: t.goal_title || ''
                }));
            }
        }
        const fallbackTontines = [
            { id: 1, name: 'Tontine Entrepreneurs', amount: 50000, frequency: 'Mensuel', members: '8/10', progression: 80, status: 'En cours', type: 'Rotative', isDrawOfficial: false },
            { id: 2, name: 'Caisse Épargne Terrain 2026', amount: 25000, frequency: 'Mensuel', members: '12/15', progression: 65, status: 'En cours', type: 'Objectif', goalAmount: 3000000, goalTitle: 'Achat terrain communautaire' },
            { id: 3, name: 'Solidarité Commerçants', amount: 100000, frequency: 'Hebdomadaire', members: '5/5', progression: 100, status: 'Terminée', type: 'Rotative', isDrawOfficial: true, certCode: '#CERT-8F39', certTime: '2026-07-20 14:30' }
        ];
        return fallbackTontines;
    }

    /**
     * Charge les membres depuis Supabase ou le state local.
     */
    async function getMembers() {
        let membersList = [];
        
        if (isSupabaseConnected && window.SupabaseService) {
            const dbData = await window.SupabaseService.fetchMembers();
            if (dbData) {
                membersList = dbData.map(m => ({
                    id: m.id,
                    name: m.full_name,
                    phone: m.phone,
                    avatar: m.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.full_name)}&background=5C60F5&color=fff`,
                    trust: m.reliability_score,
                    trustClass: m.reliability_score >= 90 ? 'excellent' : m.reliability_score >= 75 ? 'good' : 'fair',
                    status: m.is_active ? 'Actif' : 'Inactif',
                    tontines: 0,
                    contributed: m.total_contributed,
                    role: m.role || 'Membre actif'
                }));
            }
        }
        
        if (membersList.length === 0) {
            membersList = [
                { id: 'mem-1', name: 'Amadou Diallo', phone: '+225 07 01 02 03', email: 'amadou@tontinepro.com', role: 'Membre actif', status: 'À jour', tontines: 2, contributed: 150000, trust: 98, avatar: 'https://ui-avatars.com/api/?name=Amadou+Diallo&background=06b6d4&color=fff&bold=true' },
                { id: 'mem-2', name: 'Kossi Agbé', phone: '+228 90 11 22 33', email: 'kossi@tontinepro.com', role: 'Membre actif', status: 'À jour', tontines: 2, contributed: 100000, trust: 85, avatar: 'https://ui-avatars.com/api/?name=Kossi+Agbe&background=f59e0b&color=fff&bold=true' },
                { id: 'mem-3', name: 'Awa Ndiaye', phone: '+221 77 444 55 66', email: 'awa@tontinepro.com', role: 'Membre actif', status: 'En retard', tontines: 1, contributed: 25000, trust: 45, avatar: 'https://ui-avatars.com/api/?name=Awa+Ndiaye&background=ef4444&color=fff&bold=true' },
                { id: 'mem-4', name: 'Jean-Paul Koffi', phone: '+225 05 88 99 00', email: 'jp@tontinepro.com', role: 'Membre actif', status: 'À jour', tontines: 3, contributed: 225000, trust: 92, avatar: 'https://ui-avatars.com/api/?name=Jean-Paul&background=3b82f6&color=fff&bold=true' },
                { id: 'mem-5', name: 'Fatou Diop', phone: '+221 70 123 45 67', email: 'fatou@tontinepro.com', role: 'Membre actif', status: 'En retard', tontines: 1, contributed: 10000, trust: 60, avatar: 'https://ui-avatars.com/api/?name=Fatou+Diop&background=64748b&color=fff&bold=true' },
                { id: 'mem-6', name: 'David Mensah', phone: '+233 24 555 6677', email: 'david@tontinepro.com', role: 'Administrateur', status: 'À jour', tontines: 2, contributed: 180000, trust: 100, avatar: 'https://ui-avatars.com/api/?name=David+Mensah&background=8b5cf6&color=fff&bold=true' },
                { id: 'mem-7', name: 'Sophie Lemoine', phone: '+33 6 12 34 56 78', email: 'sophie@tontinepro.com', role: 'Membre actif', status: 'À jour', tontines: 1, contributed: 50000, trust: 80, avatar: 'https://ui-avatars.com/api/?name=Sophie+Lemoine&background=10b981&color=fff&bold=true' }
            ];
        }

        // Overlay roles from localStorage to ensure delegated roles persist locally
        if (!isSupabaseConnected) {
            let localMembers = JSON.parse(localStorage.getItem('tontine_extended_members') || 'null');
            if (localMembers && localMembers.length > 0) {
                membersList.forEach(m => {
                    const localMatch = localMembers.find(lm => lm.id === m.id || lm.name === m.name);
                    if (localMatch && localMatch.role) {
                        m.role = localMatch.role;
                    }
                });
            }
        }

        return membersList;
    }

    /**
     * Charge les stats du dashboard depuis Supabase ou le state local.
     */
    async function getDashboardStats() {
        if (isSupabaseConnected && window.SupabaseService) {
            const dbData = await window.SupabaseService.fetchDashboardStats();
            if (dbData) {
                const totalPayments = Math.max(1, parseInt(dbData.total_payments_received) + parseInt(dbData.total_payments_pending) + parseInt(dbData.total_payments_delayed));
                return {
                    activeTontines: dbData.active_tontines,
                    totalAmountInPlay: dbData.total_amount_in_play,
                    toursInProgress: dbData.tours_in_progress,
                    validatedPaymentsToday: dbData.validated_payments_today,
                    totalMembers: dbData.total_members,
                    participationRate: dbData.participation_rate_current_month,
                    donut: {
                        receivedPercent: Math.round((dbData.total_payments_received / totalPayments) * 100),
                        pendingPercent: Math.round((dbData.total_payments_pending / totalPayments) * 100),
                        delayedPercent: Math.round((dbData.total_payments_delayed / totalPayments) * 100),
                        receivedAmount: 1911000, // Dummy
                        pendingAmount: 441000,
                        delayedAmount: 98000
                    }
                };
            }
        }
        return {
            activeTontines: 0,
            totalAmountInPlay: 0,
            toursInProgress: 0,
            validatedPaymentsToday: 0,
            totalMembers: 0,
            participationRate: 0,
            donut: { receivedPercent: 0, pendingPercent: 0, delayedPercent: 0 }
        };
    }

    /**
     * Charge les transactions depuis Supabase ou le state local.
     */
    async function getTransactions() {
        if (isSupabaseConnected && window.SupabaseService) {
            const dbData = await window.SupabaseService.fetchTransactions(100);
            if (dbData && dbData.length > 0) {
                return dbData.map(p => {
                    let method = p.payment_method || 'mobile_money';
                    if (p.notes) {
                        if (p.notes.includes('[Moov')) method = 'moov_money';
                        else if (p.notes.includes('[Yas Mix')) method = 'yas_mix';
                        else if (p.notes.includes('[MTN')) method = 'mtn';
                    }
                    if (p.reference) {
                        if (p.reference.startsWith('MOOV-')) method = 'moov_money';
                        else if (p.reference.startsWith('YAS-')) method = 'yas_mix';
                        else if (p.reference.startsWith('WAVE-')) method = 'wave';
                        else if (p.reference.startsWith('OM-')) method = 'orange_money';
                        else if (p.reference.startsWith('CB-')) method = 'card';
                        else if (p.reference.startsWith('CASH-')) method = 'cash';
                    }

                    return {
                        id: p.id,
                        member: p.profiles ? p.profiles.full_name : 'Membre',
                        tontine: 'Tontine Principale',
                        title: `Cotisation ${p.profiles ? p.profiles.full_name : ''}`,
                        date: p.payment_date ? new Date(p.payment_date).toLocaleDateString('fr-FR') : new Date(p.created_at || Date.now()).toLocaleDateString('fr-FR'),
                        amount: p.amount,
                        type: p.payment_type === 'payout' ? 'withdrawal' : 'Cotisation',
                        status: p.status === 'valide' ? 'Validé' : (p.status === 'en_attente' ? 'En attente' : p.status),
                        method: method,
                        account: p.notes || p.reference || '—',
                        icon: 'user'
                    };
                });
            }
        }
        return [];
    }

    async function getRecentMessages() {
        if (isSupabaseConnected && window.SupabaseService && window.SupabaseService.fetchRecentMessages) {
            const dbData = await window.SupabaseService.fetchRecentMessages();
            if (dbData) {
                return dbData.map(m => ({
                    id: m.id,
                    type: m.conversations ? (m.conversations.type === 'system' ? 'system' : m.conversations.type) : 'user',
                    sender: m.conversations && m.conversations.name ? m.conversations.name : (m.profiles ? m.profiles.full_name : 'Système'),
                    text: m.content,
                    time: new Date(m.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}),
                    badge: null
                }));
            }
        }
        return [];
    }

    /**
     * Charge les notifications depuis Supabase ou le state local.
     */
    async function getNotifications() {
        if (isSupabaseConnected && window.SupabaseService) {
            const dbData = await window.SupabaseService.fetchNotifications();
            if (dbData) return dbData;
        }
        return [];
    }

    async function getReportsData() {
        if (!isSupabaseConnected || !window.SupabaseService.fetchPaymentsForReports) {
            return null; // Return null if offline
        }
        
        const payments = await window.SupabaseService.fetchPaymentsForReports();
        if (!payments) return null;

        let totalCollected = 0;
        let delayedCount = 0;
        let totalCount = payments.length;
        
        // Data for Chart: Aggregate amounts per date
        const timeline = {};

        payments.forEach(p => {
            if (p.status === 'valide') {
                totalCollected += p.amount;
                
                // Group by date for chart (YYYY-MM-DD)
                const dateKey = new Date(p.payment_date).toISOString().split('T')[0];
                if (!timeline[dateKey]) timeline[dateKey] = 0;
                timeline[dateKey] += p.amount;
            } else if (p.status === 'retard') {
                delayedCount++;
            }
        });

        // Sort dates chronologically
        const labels = Object.keys(timeline).sort();
        const dataPoints = labels.map(date => timeline[date]);

        const delayRate = totalCount > 0 ? ((delayedCount / totalCount) * 100).toFixed(1) : 0;

        return {
            totalCollected,
            delayRate,
            chartData: {
                labels,
                dataPoints
            }
        };
    }

    // ─── Data Mutations ──────────────────────────────────────────────────────

    async function createTontine(data) {
        if (!isSupabaseConnected || !window.SupabaseService.insertTontine) {
            console.log('[DataService] Création tontine locale (Mode Démo)', data);
            return {
                data: [{
                    id: 'mock-' + Date.now(),
                    name: data.name,
                    amount_per_cycle: data.amount_per_cycle,
                    frequency: data.frequency,
                    current_members: 0,
                    max_members: data.max_members,
                    progression: 0,
                    status: 'En cours',
                    type: data.type || 'Rotative',
                    goalAmount: data.goal_amount || 0,
                    goalTitle: data.goal_title || ''
                }],
                error: null
            };
        }
        return await window.SupabaseService.insertTontine(data);
    }

    async function createMember(data) {
        if (!isSupabaseConnected || !window.SupabaseService.insertMember) {
            console.log('[DataService] Création membre locale (Mode Démo)', data);
            return {
                data: [{
                    id: 'mock-member-' + Date.now(),
                    full_name: data.name,
                    phone: data.phone,
                    email: data.email || null,
                    is_active: data.status === 'Actif',
                    reliability_score: 100,
                    total_contributed: 0
                }],
                error: null
            };
        }
        return await window.SupabaseService.insertMember(data);
    }

    async function createMessage(data) {
        if (!isSupabaseConnected || !window.SupabaseService.insertMessage) return { error: null };
        return await window.SupabaseService.insertMessage(data);
    }

    async function createPayment(data) {
        if (!isSupabaseConnected || !window.SupabaseService.insertPayment) {
            console.log('[DataService] Création paiement local (Mode Démo)', data);
            return {
                data: [{
                    id: 'mock-pay-' + Date.now(),
                    tontine_id: data.tontine_id || 'mock-tontine-id',
                    payer_id: data.member_id,
                    amount: data.amount,
                    payment_method: data.payment_method || 'mobile_money',
                    status: data.status || 'valide',
                    payment_type: data.payment_type || 'cotisation',
                    created_at: new Date().toISOString()
                }],
                error: null
            };
        }
        return await window.SupabaseService.insertPayment(data);
    }

    async function deleteTontine(tontineId) {
        if (!isSupabaseConnected || !window.SupabaseService.deleteTontine) {
            console.log('[DataService] Suppression tontine locale (Mode Démo)', tontineId);
            return { error: null };
        }
        return await window.SupabaseService.deleteTontine(tontineId);
    }

    async function updateTontine(tontineId, payload) {
        if (!isSupabaseConnected || !window.SupabaseService.updateTontine) {
            console.log('[DataService] Modification tontine locale (Mode Démo)', tontineId, payload);
            return { error: null };
        }
        return await window.SupabaseService.updateTontine(tontineId, payload);
    }

    // ─── Auth Proxy ────────────────────────────────────────────────────────
    
    async function getSession() {
        if (!window.SupabaseService) return { data: { session: null } };
        return await window.SupabaseService.getSession();
    }

    async function signOut() {
        if (!window.SupabaseService) return;
        return await window.SupabaseService.signOut();
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        init,
        getTontines,
        getMembers,
        getDashboardStats,
        getReportsData,
        getTransactions,
        getNotifications,
        getRecentMessages,
        createTontine,
        createMember,
        updateTontine,
        deleteTontine,
        createMessage,
        createPayment,
        getSession,
        signOut,
        isConnected: () => isSupabaseConnected,
        isDemoMode: () => isDemoMode
    };

})();
