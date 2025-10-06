// Wait for the page to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing Firebase...');
    
    // Firebase configuration
    const firebaseConfig = {
        apiKey: "AIzaSyDKl95SU8HsH2WuG7nGngesT1eBXBSuUcA",
        authDomain: "chatapp-48849.firebaseapp.com",
        databaseURL: "https://chatapp-48849-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "chatapp-48849",
        storageBucket: "chatapp-48849.firebasestorage.app",
        messagingSenderId: "50270417905",
        appId: "1:50270417905:web:e5193cfb1b91caf4178a50",
        measurementId: "G-S8ND1H5CWK"
    };

    // Initialize Firebase
    const app = firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    const auth = firebase.auth();

    console.log('Firebase initialized');

    // DOM elements
    const elements = {
        userCount: document.getElementById('user-count'),
        usersList: document.getElementById('users-list'),
        allUsersList: document.getElementById('all-users-list'),
        chatMessages: document.getElementById('chat-messages'),
        messageInput: document.getElementById('message-input'),
        sendButton: document.getElementById('send-btn'),
        notification: document.getElementById('notification'),
        loginModal: document.getElementById('login-modal'),
        loginEmail: document.getElementById('login-email'),
        loginPassword: document.getElementById('login-password'),
        loginButton: document.getElementById('login-btn'),
        logoutButton: document.getElementById('logout-btn'),
        chatTitle: document.getElementById('chat-title'),
        messageInputContainer: document.getElementById('message-input-container'),
        adminPanel: document.getElementById('admin-panel'),
        newUserEmail: document.getElementById('new-user-email'),
        newUserPassword: document.getElementById('new-user-password'),
        newUserName: document.getElementById('new-user-name'),
        addUserButton: document.getElementById('add-user-btn'),
        currentUser: document.getElementById('current-user'),
        contextMenu: document.getElementById('context-menu'),
        contextPrivateMessage: document.getElementById('context-private-message')
    };

    // App state
    let currentUser = null;
    let currentUserData = null;
    let users = {};
    let registeredUsers = {};
    let selectedPrivateUser = null;
    let isAdmin = false;
    let contextMenuTarget = null;

    const ADMIN_UID = "uPTgtjHksOWmvtBFcHmpPGkKaFr2";

    // Initialize the app
    init();

    function init() {
        console.log('Initializing app...');
        setupEventListeners();
        setupContextMenu();
        
        // Listen for auth state changes
        auth.onAuthStateChanged(function(user) {
            console.log('Auth state changed:', user);
            if (user) {
                currentUser = user;
                console.log('User signed in:', user.uid);
                showNotification('Login successful!');
                
                // Initialize user data and listeners
                initializeUserSession(user);
            } else {
                console.log('User signed out');
                currentUser = null;
                elements.loginModal.style.display = 'flex';
                elements.messageInputContainer.style.display = 'none';
                elements.adminPanel.style.display = 'none';
            }
        });
    }

    function initializeUserSession(user) {
        // First, add user to registeredUsers if they don't exist
        const userRef = database.ref('chat/registeredUsers/' + user.uid);
        
        userRef.once('value').then(function(snapshot) {
            if (!snapshot.exists()) {
                // User not in registeredUsers, add them
                console.log('Adding user to registeredUsers');
                return userRef.set({
                    username: user.email.split('@')[0],
                    email: user.email,
                    isAdmin: user.uid === ADMIN_UID,
                    created: Date.now()
                });
            }
            return snapshot.val();
        }).then(function(userData) {
            if (userData) {
                currentUserData = userData;
                isAdmin = userData.isAdmin || false;
                
                // Update UI
                elements.loginModal.style.display = 'none';
                elements.messageInputContainer.style.display = 'block';
                if (isAdmin) {
                    elements.adminPanel.style.display = 'block';
                }
                
                updateCurrentUserDisplay(user);
                addCurrentUserToOnline();
                setupFirebaseListeners();
                
                console.log('User session initialized successfully');
            }
        }).catch(function(error) {
            console.error('Error initializing user session:', error);
            showNotification('Error initializing session', true);
        });
    }

    function setupEventListeners() {
        elements.loginButton.addEventListener('click', handleLogin);
        elements.loginPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleLogin();
        });
        elements.logoutButton.addEventListener('click', handleLogout);
        elements.sendButton.addEventListener('click', sendMessage);
        elements.messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        elements.addUserButton.addEventListener('click', addUser);

        // Close context menu when clicking elsewhere
        document.addEventListener('click', function() {
            elements.contextMenu.style.display = 'none';
            document.querySelectorAll('.user-item').forEach(function(item) {
                item.classList.remove('context-active');
            });
        });
    }

    function setupContextMenu() {
        // Right-click context menu for users
        document.addEventListener('contextmenu', function(e) {
            const userItem = e.target.closest('.user-item');
            if (userItem && userItem.dataset.uid !== currentUser?.uid) {
                e.preventDefault();
                contextMenuTarget = userItem.dataset.uid;
                
                // Highlight the user item
                document.querySelectorAll('.user-item').forEach(function(item) {
                    item.classList.remove('context-active');
                });
                userItem.classList.add('context-active');
                
                // Position and show context menu
                elements.contextMenu.style.display = 'block';
                elements.contextMenu.style.left = e.pageX + 'px';
                elements.contextMenu.style.top = e.pageY + 'px';
            }
        });

        // Context menu actions
        elements.contextPrivateMessage.addEventListener('click', function() {
            if (contextMenuTarget) {
                startPrivateChat(contextMenuTarget);
                elements.contextMenu.style.display = 'none';
            }
        });
    }

    function startPrivateChat(targetUid) {
        selectedPrivateUser = targetUid;
        const targetUser = users[targetUid] || registeredUsers[targetUid];
        if (targetUser) {
            elements.chatTitle.innerHTML = '<i>🔒</i> Private Chat with ' + targetUser.username;
            // Clear current messages and load private conversation
            loadPrivateConversation(targetUid);
        }
    }

    function loadPrivateConversation(targetUid) {
        elements.chatMessages.innerHTML = '';
        
        // Load existing private messages between these users
        const privateMessagesRef = database.ref('chat/messages/private');
        privateMessagesRef.once('value').then(function(snapshot) {
            const messages = snapshot.val() || {};
            const conversationMessages = Object.values(messages).filter(function(msg) {
                return (msg.senderUid === currentUser.uid && msg.recipient === targetUid) ||
                       (msg.senderUid === targetUid && msg.recipient === currentUser.uid);
            }).sort(function(a, b) {
                return new Date(a.timestamp) - new Date(b.timestamp);
            });
            
            conversationMessages.forEach(function(message) {
                addMessageToChat(message, 'private');
            });
            
            if (conversationMessages.length === 0) {
                addSystemMessage('Start a private conversation with ' + (users[targetUid]?.username || registeredUsers[targetUid]?.username));
            }
        }).catch(function(error) {
            console.error('Error loading private conversation:', error);
            addSystemMessage('Error loading conversation');
        });
    }

    function addSystemMessage(text) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message other';
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-sender">System</span>
                <span class="message-time">Just now</span>
            </div>
            <div class="message-text">${text}</div>
        `;
        elements.chatMessages.appendChild(messageElement);
    }

    function updateCurrentUserDisplay(user) {
        if (elements.currentUser) {
            const displayName = currentUserData?.username || user.email.split('@')[0];
            elements.currentUser.innerHTML = `
                <div class="user-avatar">${displayName.charAt(0).toUpperCase()}</div>
                <div>
                    <div style="font-weight: 600;">${displayName}</div>
                    <div style="font-size: 0.8rem; opacity: 0.8;">${isAdmin ? 'Administrator' : 'User'}</div>
                </div>
            `;
        }
    }

    function handleLogin() {
        const email = elements.loginEmail.value.trim();
        const password = elements.loginPassword.value;
        
        if (!email || !password) {
            showNotification('Please enter both email and password', true);
            return;
        }
        
        console.log('Attempting login with:', email);
        
        auth.signInWithEmailAndPassword(email, password)
            .then(function(userCredential) {
                console.log('Login successful');
            })
            .catch(function(error) {
                console.error('Login error:', error);
                let errorMessage = 'Login failed';
                
                switch (error.code) {
                    case 'auth/invalid-email':
                        errorMessage = 'Invalid email address';
                        break;
                    case 'auth/user-disabled':
                        errorMessage = 'This account has been disabled';
                        break;
                    case 'auth/user-not-found':
                        errorMessage = 'No account found with this email';
                        break;
                    case 'auth/wrong-password':
                        errorMessage = 'Incorrect password';
                        break;
                    default:
                        errorMessage = error.message;
                }
                
                showNotification(errorMessage, true);
            });
    }

    function handleLogout() {
        if (currentUser) {
            const onlineUserRef = database.ref('chat/onlineUsers/' + currentUser.uid);
            onlineUserRef.set(null).catch(function(error) {
                console.error('Error removing from online users:', error);
            });
            
            auth.signOut().then(function() {
                showNotification('Logged out successfully');
            }).catch(function(error) {
                console.error('Logout error:', error);
            });
        }
    }

    function setupFirebaseListeners() {
        console.log('Setting up Firebase listeners...');
        
        // Online users listener
        const onlineUsersRef = database.ref('chat/onlineUsers');
        onlineUsersRef.on('value', function(snapshot) {
            users = snapshot.val() || {};
            console.log('Online users updated:', users);
            updateUserList();
        }, function(error) {
            console.error('Online users listener error:', error);
        });
        
        // Registered users listener
        const registeredUsersRef = database.ref('chat/registeredUsers');
        registeredUsersRef.on('value', function(snapshot) {
            registeredUsers = snapshot.val() || {};
            console.log('Registered users updated:', registeredUsers);
            updateAllUsersList();
        }, function(error) {
            console.error('Registered users listener error:', error);
        });
        
        // Public messages listener
        const publicMessagesRef = database.ref('chat/messages/public');
        publicMessagesRef.on('value', function(snapshot) {
            if (!selectedPrivateUser) {
                elements.chatMessages.innerHTML = '';
                const messages = snapshot.val() || {};
                console.log('Public messages updated:', messages);
                Object.values(messages).forEach(function(message) {
                    addMessageToChat(message, 'public');
                });
            }
        }, function(error) {
            console.error('Public messages listener error:', error);
        });
        
        // Private messages listener
        const privateMessagesRef = database.ref('chat/messages/private');
        privateMessagesRef.on('value', function(snapshot) {
            const messages = snapshot.val() || {};
            console.log('Private messages updated:', messages);
            Object.values(messages).forEach(function(message) {
                if (message.recipient === currentUser.uid || message.senderUid === currentUser.uid) {
                    if (!document.querySelector('[data-message-id="' + message.id + '"]')) {
                        // If we're in a private chat with this user, show the message
                        if (selectedPrivateUser && 
                            ((message.senderUid === currentUser.uid && message.recipient === selectedPrivateUser) ||
                             (message.senderUid === selectedPrivateUser && message.recipient === currentUser.uid))) {
                            addMessageToChat(message, 'private');
                        }
                        
                        // Show notification for new private messages
                        if (message.recipient === currentUser.uid && message.senderUid !== currentUser.uid) {
                            showChatNotification(message);
                        }
                    }
                }
            });
        }, function(error) {
            console.error('Private messages listener error:', error);
        });
    }

    function addCurrentUserToOnline() {
        if (currentUser && currentUserData) {
            const onlineUserRef = database.ref('chat/onlineUsers/' + currentUser.uid);
            onlineUserRef.set({
                username: currentUserData.username,
                uid: currentUser.uid,
                lastActive: Date.now(),
                online: true
            }).then(function() {
                console.log('Added user to online users');
            }).catch(function(error) {
                console.error('Error adding to online users:', error);
            });
            
            // Update activity every 30 seconds
            setInterval(function() {
                if (currentUser) {
                    onlineUserRef.update({
                        lastActive: Date.now()
                    }).catch(function(error) {
                        console.error('Error updating user activity:', error);
                    });
                }
            }, 30000);
        }
    }

    function addUser() {
        const email = elements.newUserEmail.value.trim();
        const password = elements.newUserPassword.value;
        const username = elements.newUserName.value.trim();
        
        if (!email || !password || !username) {
            showNotification('Please fill all fields', true);
            return;
        }
        
        auth.createUserWithEmailAndPassword(email, password)
            .then(function(userCredential) {
                const user = userCredential.user;
                const userRef = database.ref('chat/registeredUsers/' + user.uid);
                return userRef.set({
                    username: username,
                    email: email,
                    isAdmin: false,
                    created: Date.now()
                });
            })
            .then(function() {
                elements.newUserEmail.value = '';
                elements.newUserPassword.value = '';
                elements.newUserName.value = '';
                showNotification('User "' + username + '" created successfully');
            })
            .catch(function(error) {
                console.error('Error creating user:', error);
                showNotification('Error creating user: ' + error.message, true);
            });
    }

    function updateUserList() {
        const onlineUsers = Object.keys(users).filter(function(uid) {
            return users[uid].online && uid !== currentUser?.uid;
        });
        elements.userCount.textContent = onlineUsers.length;
        
        // Remove inactive users
        const now = Date.now();
        Object.keys(users).forEach(function(uid) {
            if (now - users[uid].lastActive > 60000) {
                database.ref('chat/onlineUsers/' + uid).update({ online: false }).catch(function(error) {
                    console.error('Error updating user status:', error);
                });
            }
        });
        
        elements.usersList.innerHTML = '';
        onlineUsers.forEach(function(uid) {
            createUserListItem(elements.usersList, users[uid], uid);
        });
    }

    function updateAllUsersList() {
        elements.allUsersList.innerHTML = '';
        
        Object.keys(registeredUsers).forEach(function(uid) {
            if (uid !== currentUser?.uid) {
                const userData = registeredUsers[uid];
                const isOnline = users[uid]?.online || false;
                createUserListItem(elements.allUsersList, { ...userData, online: isOnline }, uid);
            }
        });
    }

    function createUserListItem(container, user, uid) {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.dataset.uid = uid;
        
        userElement.innerHTML = `
            <div class="user-avatar-small" style="background: ${user.online ? '#28a745' : '#6c757d'}">
                ${user.username?.charAt(0).toUpperCase() || '?'}
            </div>
            <div class="user-details">
                <div class="user-name">${user.username || 'Unknown User'}</div>
                <div class="user-status">
                    <div class="status-indicator ${user.online ? '' : 'offline'}"></div>
                    ${user.online ? 'Online' : 'Offline'}
                </div>
            </div>
        `;
        
        container.appendChild(userElement);
    }

    function sendMessage() {
        const messageText = elements.messageInput.value.trim();
        if (!messageText) return;
        
        const message = {
            id: Date.now().toString(),
            sender: currentUserData.username,
            senderUid: currentUser.uid,
            text: messageText,
            timestamp: new Date().toISOString()
        };
        
        let messageRef;
        
        if (selectedPrivateUser) {
            // Send private message
            message.recipient = selectedPrivateUser;
            message.recipientName = users[selectedPrivateUser]?.username || registeredUsers[selectedPrivateUser]?.username;
            messageRef = database.ref('chat/messages/private');
        } else {
            // Send public message
            messageRef = database.ref('chat/messages/public');
        }
        
        messageRef.push(message).then(function() {
            console.log('Message sent successfully');
            elements.messageInput.value = '';
            elements.messageInput.focus();
        }).catch(function(error) {
            console.error('Error sending message:', error);
            showNotification('Error sending message: ' + error.message, true);
        });
    }

    function addMessageToChat(message, type) {
        const messageElement = document.createElement('div');
        const isOwnMessage = message.senderUid === currentUser.uid;
        
        messageElement.className = 'message ' + (isOwnMessage ? 'own' : 'other') + ' ' + (type === 'private' ? 'private' : '');
        messageElement.setAttribute('data-message-id', message.id);
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${message.sender}</span>
                ${type === 'private' ? '<span class="private-badge">Private</span>' : ''}
                <span class="message-time">${formatTimestamp(message.timestamp)}</span>
            </div>
            <div class="message-text">${message.text}</div>
        `;
        
        elements.chatMessages.appendChild(messageElement);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    function showChatNotification(message) {
        // Optional: Implement desktop notifications
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Private message from ' + message.sender, {
                body: message.text
            });
        }
    }

    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function showNotification(message, isError) {
        elements.notification.textContent = message;
        elements.notification.className = 'notification ' + (isError ? 'error' : '');
        elements.notification.classList.add('show');
        setTimeout(function() {
            elements.notification.classList.remove('show');
        }, 3000);
    }

    // Request notification permission
    if ('Notification' in window) {
        Notification.requestPermission();
    }
});
