var app = angular.module("tripApp", []);

app.controller("TripController", function ($scope) {

    // --- Core Data Structures & Persistence ---
    const STORAGE_KEY = 'tripBillSplitter_v2';

    $scope.categories = [
        { id: 'food', name: 'Food & Drink' },
        { id: 'transport', name: 'Transport' },
        { id: 'stay', name: 'Accommodation' },
        { id: 'activities', name: 'Activities' },
        { id: 'other', name: 'Other' }
    ];

    $scope.loadAllData = function() {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                $scope.trips = parsed.trips || {};
                $scope.currentTripId = parsed.currentTripId || null;
                $scope.theme = parsed.theme || 'light';
            } catch (e) {
                console.error("Error loading data", e);
                $scope.resetToDefault();
            }
        } else {
            $scope.resetToDefault();
        }

        document.documentElement.setAttribute('data-theme', $scope.theme);

        // If no trips exist, create a default one
        if (Object.keys($scope.trips).length === 0) {
            $scope.createNewTrip("My First Trip");
        } else if (!$scope.currentTripId || !$scope.trips[$scope.currentTripId]) {
            $scope.currentTripId = Object.keys($scope.trips)[0];
        }

        $scope.syncCurrentTripRef();
        $scope.calculateSplit();
    };

    $scope.resetToDefault = function() {
        $scope.trips = {};
        $scope.currentTripId = null;
    };

    $scope.syncCurrentTripRef = function() {
        if ($scope.currentTripId && $scope.trips[$scope.currentTripId]) {
            $scope.currentTrip = $scope.trips[$scope.currentTripId];
            $scope.newExpense = $scope.resetNewExpense();
            $scope.refreshMemberInvolvement();
        }
    };

    $scope.saveAllData = function() {
        const data = {
            trips: $scope.trips,
            currentTripId: $scope.currentTripId,
            theme: $scope.theme
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        $scope.calculateSplit();
    };

    $scope.toggleTheme = function() {
        $scope.theme = $scope.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', $scope.theme);
        $scope.saveAllData();
    };

    // --- Trip Management ---

    $scope.createNewTrip = function(name) {
        if (!name) return;
        const id = 'trip_' + Date.now();
        $scope.trips[id] = {
            id: id,
            name: name,
            members: [],
            expenses: []
        };
        $scope.currentTripId = id;
        $scope.syncCurrentTripRef();
        $scope.tripNameInput = "";
        $scope.saveAllData();
    };

    $scope.switchTrip = function(id) {
        if ($scope.trips[id]) {
            $scope.currentTripId = id;
            $scope.syncCurrentTripRef();
            $scope.saveAllData();
        }
    };

    $scope.deleteTrip = function(id) {
        if (Object.keys($scope.trips).length <= 1) {
            alert("You must have at least one trip.");
            return;
        }
        if (confirm("Are you sure you want to delete this trip and all its data?")) {
            delete $scope.trips[id];
            if ($scope.currentTripId === id) {
                $scope.currentTripId = Object.keys($scope.trips)[0];
            }
            $scope.syncCurrentTripRef();
            $scope.saveAllData();
        }
    };

    $scope.renameTrip = function() {
        const newName = prompt("Enter new trip name:", $scope.currentTrip.name);
        if (newName) {
            $scope.currentTrip.name = newName;
            $scope.saveAllData();
        }
    };


    // --- Form & Split Helpers ---

    $scope.resetNewExpense = function() {
        return {
            name: "",
            amount: 0,
            categoryId: $scope.categories[0].id,
            splitMode: 'equal', // 'equal' or 'exact'
            payers: {}, // { "MemberName": amount }
            involvedMembers: {}, // Used for equal split: { "MemberName": true }
            exactAmounts: {} // Used for exact split: { "MemberName": amount }
        };
    };

    $scope.refreshMemberInvolvement = function() {
        if (!$scope.currentTrip) return;
        $scope.currentTrip.members.forEach(m => {
            if ($scope.newExpense.involvedMembers[m] === undefined) $scope.newExpense.involvedMembers[m] = true;
            if ($scope.newExpense.payers[m] === undefined) $scope.newExpense.payers[m] = 0;
            if ($scope.newExpense.exactAmounts[m] === undefined) $scope.newExpense.exactAmounts[m] = 0;
        });
    };

    // Calculation for visual aid in the form
    $scope.getFormPayerTotal = function() {
        return Object.values($scope.newExpense.payers).reduce((a, b) => a + (Number(b) || 0), 0);
    };

    $scope.getFormSplitTotal = function() {
        if ($scope.newExpense.splitMode === 'equal') {
            return $scope.getFormPayerTotal();
        }
        return Object.values($scope.newExpense.exactAmounts).reduce((a, b) => a + (Number(b) || 0), 0);
    };


    // --- Member Actions ---

    $scope.addMember = function () {
        if ($scope.memberName && !$scope.currentTrip.members.includes($scope.memberName)) {
            $scope.currentTrip.members.push($scope.memberName);
            $scope.memberName = "";
            $scope.refreshMemberInvolvement();
            $scope.saveAllData();
        }
    };

    $scope.removeMember = function(member) {
        const isInvolved = $scope.currentTrip.expenses.some(e => 
            e.payers[member] || e.involvedMembers.includes(member)
        );
        if (isInvolved) {
            alert(`Cannot remove ${member}. They are involved in existing expenses.`);
            return;
        }
        $scope.currentTrip.members = $scope.currentTrip.members.filter(m => m !== member);
        $scope.saveAllData();
    };


    // --- Expense Actions ---

    $scope.addExpense = function () {
        const payers = {};
        let totalAmount = 0;
        Object.keys($scope.newExpense.payers).forEach(m => {
            const val = Number($scope.newExpense.payers[m]) || 0;
            if (val > 0) {
                payers[m] = val;
                totalAmount += val;
            }
        });

        if (totalAmount <= 0 || !$scope.newExpense.name) {
            alert("Please enter a valid expense name and total amount paid.");
            return;
        }

        let finalInvolved = [];
        if ($scope.newExpense.splitMode === 'equal') {
            finalInvolved = Object.keys($scope.newExpense.involvedMembers)
                                 .filter(m => $scope.newExpense.involvedMembers[m]);
            if (finalInvolved.length === 0) {
                alert("Select at least one person to split with.");
                return;
            }
        } else {
            // Exact mode
            let splitTotal = 0;
            Object.keys($scope.newExpense.exactAmounts).forEach(m => {
                const val = Number($scope.newExpense.exactAmounts[m]) || 0;
                if (val > 0) {
                    finalInvolved.push({ member: m, amount: val });
                    splitTotal += val;
                }
            });
            if (Math.abs(splitTotal - totalAmount) > 0.01) {
                alert(`Split total (${splitTotal}) must equal paid total (${totalAmount}).`);
                return;
            }
        }

        $scope.currentTrip.expenses.push({
            id: Date.now().toString(),
            name: $scope.newExpense.name,
            totalAmount: totalAmount,
            payers: payers,
            categoryId: $scope.newExpense.categoryId,
            splitMode: $scope.newExpense.splitMode,
            involved: finalInvolved, // Array of strings (Equal) OR objects (Exact)
            date: new Date().toISOString()
        });

        $scope.newExpense = $scope.resetNewExpense();
        $scope.refreshMemberInvolvement();
        $scope.saveAllData();
    };

    $scope.removeExpense = function(id) {
        if (confirm("Delete this expense?")) {
            $scope.currentTrip.expenses = $scope.currentTrip.expenses.filter(e => e.id !== id);
            $scope.saveAllData();
        }
    };


    // --- Core Logic & Analytics ---

    $scope.calculateSplit = function () {
        $scope.results = [];
        $scope.categoryTotals = [];
        if (!$scope.currentTrip || $scope.currentTrip.members.length === 0) return;

        // Analytics
        let catMap = {};
        $scope.categories.forEach(c => catMap[c.id] = 0);
        let grandTotal = 0;

        // Financial Balances
        let balances = {};
        $scope.currentTrip.members.forEach(m => balances[m] = 0);

        $scope.currentTrip.expenses.forEach(e => {
            grandTotal += e.totalAmount;
            catMap[e.categoryId] = (catMap[e.categoryId] || 0) + e.totalAmount;

            // Credits for payers
            Object.keys(e.payers).forEach(m => balances[m] += e.payers[m]);

            // Debits for split
            if (e.splitMode === 'equal') {
                const share = e.totalAmount / e.involved.length;
                e.involved.forEach(m => balances[m] -= share);
            } else {
                e.involved.forEach(item => balances[item.member] -= item.amount);
            }
        });

        // Resolve Debts (Simplified settlement algorithm)
        let debtors = [];
        let creditors = [];
        $scope.currentTrip.members.forEach(m => {
            let b = Math.round(balances[m] * 100) / 100;
            if (b > 0) creditors.push({ member: m, amount: b });
            else if (b < 0) debtors.push({ member: m, amount: Math.abs(b) });
        });

        let i = 0, j = 0;
        while (i < debtors.length && j < creditors.length) {
            let amt = Math.min(debtors[i].amount, creditors[j].amount);
            $scope.results.push({ from: debtors[i].member, to: creditors[j].member, amount: amt.toFixed(2), type: 'transaction' });
            debtors[i].amount -= amt;
            creditors[j].amount -= amt;
            if (debtors[i].amount < 0.01) i++;
            if (creditors[j].amount < 0.01) j++;
        }

        if ($scope.results.length === 0) {
            $scope.results.push({ type: 'settled', text: grandTotal > 0 ? "Everyone is settled up!" : "No expenses yet." });
        }

        // Category breakdown assembly
        $scope.categoryTotals = $scope.categories
            .map(c => ({ category: c, amount: catMap[c.id], percent: grandTotal > 0 ? ((catMap[c.id] / grandTotal) * 100).toFixed(1) : 0 }))
            .filter(c => c.amount > 0)
            .sort((a, b) => b.amount - a.amount);
    };

    $scope.getCategory = function(id) {
        return $scope.categories.find(c => c.id === id) || $scope.categories[4];
    };

    $scope.copySummary = function() {
        let text = `Trip: ${$scope.currentTrip.name}\n\nSettlements:\n`;
        $scope.results.forEach(r => {
            if (r.type === 'transaction') text += `• ${r.from} owes ${r.to} ₹${r.amount}\n`;
            else text += `• ${r.text}\n`;
        });
        text += `\nCategory Breakdown:\n`;
        $scope.categoryTotals.forEach(c => text += `${c.category.icon} ${c.category.name}: ₹${c.amount}\n`);
        navigator.clipboard.writeText(text).then(() => alert("Copied!"));
    };

    $scope.loadAllData();
});