/**
 * friendRequest.js
 * 
 * Implements user search, friend request sending, accepting, and notification handling.
 * Uses Pinata API to fetch and update user data JSON files.
 */

if (typeof PINATA_API_KEY === 'undefined') {
  var PINATA_API_KEY = '3a9e81513e7c81e26d11';
}
if (typeof PINATA_SECRET_API_KEY === 'undefined') {
  var PINATA_SECRET_API_KEY = '2a937c360d5e3f5a4c18967830e92e0e2568e103479743ef8831d87c90eed9a8';
}

/**
 * Fetch pinned files metadata from Pinata for the given type.
 * @param {string} type - Optional type to filter files
 * @returns {Promise<Array>} Array of pinned file metadata
 */
async function fetchPinnedFiles(type) {
    const url = `https://api.pinata.cloud/data/pinList?includeCount=false&status=pinned`;
    console.log('Fetching pinned files from Pinata...');
    const response = await fetch(url, {
        headers: {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_API_KEY
        }
    });
    console.log('Pinata response status:', response.status);
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch pinned files from Pinata:', errorText);
        throw new Error('Failed to fetch pinned files from Pinata');
    }
    const data = await response.json();
    let rows = data.rows || [];
    console.log('Fetched pinned files:', rows.length, 'files');

    // Filter by type if provided
    if (type) {
        rows = rows.filter(file => file.metadata && file.metadata.keyvalues && file.metadata.keyvalues.type === type);
        console.log('Filtered to', rows.length, 'files of type:', type);
    }

    // Sort by date_pinned descending to get the latest files first
    rows.sort((a, b) => new Date(b.date_pinned) - new Date(a.date_pinned));

    return rows;
}

/**
 * Fetch user data JSON from IPFS hash.
 * @param {string} ipfsHash 
 * @returns {Promise<Object>} user data JSON
 */
async function fetchUserData(ipfsHash) {
    const response = await fetch(`https://ipfs.io/ipfs/${ipfsHash}`);
    if (!response.ok) {
        throw new Error('Failed to fetch user data JSON from IPFS');
    }
    return await response.json();
}

/**
 * Upload updated user data JSON to Pinata.
 * @param {Object} userData 
 * @param {string} userEmail 
 * @returns {Promise<Object>} Pinata response JSON
 */
async function uploadUserData(userData, userEmail) {
    // If there's an old IPFS hash, unpin it first
    if (userData._ipfsHash) {
        try {
            console.log(`Unpinning old file: ${userData._ipfsHash}`);
            const unpinResponse = await fetch(`https://api.pinata.cloud/pinning/unpin/${userData._ipfsHash}`, {
                method: 'DELETE',
                headers: {
                    'pinata_api_key': PINATA_API_KEY,
                    'pinata_secret_api_key': PINATA_SECRET_API_KEY
                }
            });
            if (unpinResponse.ok) {
                console.log(`Successfully unpinned old file: ${userData._ipfsHash}`);
            } else {
                console.warn(`Failed to unpin old file: ${userData._ipfsHash}`, await unpinResponse.text());
            }
        } catch (error) {
            console.error('Error unpinning old file:', error);
        }
    }

    const updatedJsonData = JSON.stringify(userData);
    const blob = new Blob([updatedJsonData], { type: 'application/json' });
    const file = new File([blob], `${userEmail}.json`, { type: 'application/json', lastModified: Date.now() });

    const formData = new FormData();
    formData.append('file', file);

    const metadata = JSON.stringify({
        name: `user_${userEmail}`,
        keyvalues: {
            email: userEmail,
            type: 'registration_data'
        }
    });
    formData.append('pinataMetadata', metadata);

    const options = JSON.stringify({
        cidVersion: 0
    });
    formData.append('pinataOptions', options);

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_API_KEY
        },
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to upload user data JSON to Pinata:', errorText);
        throw new Error('Failed to upload user data JSON to Pinata');
    }

    const result = await response.json();
    console.log(`Successfully uploaded new user data for ${userEmail}:`, result.IpfsHash);
    return result;
}

/**
 * Search user by email.
 * @param {string} email 
 * @returns {Promise<Object|null>} user data or null if not found
 */
async function searchUserByEmail(email) {
    const emailLower = email.toLowerCase().trim();
    console.log(`Searching for user by email: ${emailLower}`);
    const pinnedFiles = await fetchPinnedFiles('registration_data');
    console.log('Looking for user file in pinned files...');
    const userFile = pinnedFiles.find(file => file.metadata && file.metadata.keyvalues && file.metadata.keyvalues.email === emailLower);
    if (!userFile) {
        console.log(`User file not found for email: ${emailLower}`);
        return null;
    }
    console.log(`Found user file for ${emailLower}:`, userFile.ipfs_pin_hash);
    const userData = await fetchUserData(userFile.ipfs_pin_hash);
    console.log(`Fetched user data for ${emailLower}:`, {
        followersCount: userData.followersCount,
        followingCount: userData.followingCount,
        hasNotifications: !!userData.notifications,
        hasFollowingList: !!userData.followingList,
        hasFollowersList: !!userData.followersList
    });
    userData._pinataFileId = userFile.id; // store pin id for updates
    userData._ipfsHash = userFile.ipfs_pin_hash; // store IPFS hash for unpinning
    return userData;
}

/**
 * Send friend request from fromUserEmail to toUserEmail.
 * Adds a notification to toUser's userData.notifications array.
 * @param {string} fromUserEmail
 * @param {string} toUserEmail
 */
async function sendFriendRequest(fromUserEmail, toUserEmail) {
    console.log(`Sending friend request: ${fromUserEmail} -> ${toUserEmail}`);

    const toUser = await searchUserByEmail(toUserEmail);
    if (!toUser) {
        throw new Error('Recipient user not found');
    }

    if (!toUser.notifications) {
        toUser.notifications = [];
    }

    // Check if friend request already exists
    const existingRequest = toUser.notifications.find(n => n.type === 'friend_request' && n.from === fromUserEmail);
    if (existingRequest) {
        console.log('Friend request already exists');
        throw new Error('Friend request already sent');
    }

    // Add friend request notification
    const notification = {
        type: 'friend_request',
        from: fromUserEmail,
        date: new Date().toISOString()
    };

    toUser.notifications.push(notification);
    console.log(`Added friend request notification to ${toUserEmail}'s notifications`);

    // Upload updated user data JSON
    try {
        const result = await uploadUserData(toUser, toUserEmail);
        console.log(`Friend request sent successfully to ${toUserEmail}:`, result);
    } catch (error) {
        console.error('Error sending friend request:', error);
        throw error;
    }
}

/**
 * Accept friend request from fromUserEmail by toUserEmail.
 * Updates followers and following counts for both users.
 * Removes the friend request notification.
 * @param {string} fromUserEmail
 * @param {string} toUserEmail
 */
async function acceptFriendRequest(fromUserEmail, toUserEmail) {
    console.log(`Accepting friend request: ${fromUserEmail} -> ${toUserEmail}`);

    const toUser = await searchUserByEmail(toUserEmail);
    const fromUser = await searchUserByEmail(fromUserEmail);

    if (!toUser || !fromUser) {
        throw new Error('User(s) not found');
    }

    // Remove friend request notification from toUser
    if (toUser.notifications) {
        const originalLength = toUser.notifications.length;
        toUser.notifications = toUser.notifications.filter(n => !(n.type === 'friend_request' && n.from === fromUserEmail));
        console.log(`Removed ${originalLength - toUser.notifications.length} friend request notifications`);
    }

    // Ensure followingList and followersList are initialized arrays
    if (!toUser.followingList) {
        toUser.followingList = [];
    }
    if (!fromUser.followingList) {
        fromUser.followingList = [];
    }
    if (!toUser.followersList) {
        toUser.followersList = [];
    }
    if (!fromUser.followersList) {
        fromUser.followersList = [];
    }

    // Add the relationship: fromUser is now following toUser
    if (!fromUser.followingList.includes(toUserEmail.toLowerCase().trim())) {
        fromUser.followingList.push(toUserEmail.toLowerCase().trim());
        console.log(`${fromUserEmail} added ${toUserEmail} to following list`);
    }

    // Add the reverse relationship: toUser is now followed by fromUser
    if (!toUser.followersList.includes(fromUserEmail.toLowerCase().trim())) {
        toUser.followersList.push(fromUserEmail.toLowerCase().trim());
        console.log(`${toUserEmail} added ${fromUserEmail} to followers list`);
    }

    // Sync counts with list lengths
    toUser.followersCount = toUser.followersList.length;
    fromUser.followingCount = fromUser.followingList.length;

    console.log(`Synced counts - ${toUserEmail}: followersCount = ${toUser.followersCount}`);
    console.log(`Synced counts - ${fromUserEmail}: followingCount = ${fromUser.followingCount}`);

    // The reverse relationship (toUser following fromUser) is not automatically created
    // That would require a separate mutual follow or the user explicitly following back

    // Upload updated user data JSON for both users
    try {
        const toUserResult = await uploadUserData(toUser, toUserEmail);
        console.log(`Updated ${toUserEmail} data:`, toUserResult);

        const fromUserResult = await uploadUserData(fromUser, fromUserEmail);
        console.log(`Updated ${fromUserEmail} data:`, fromUserResult);

        console.log('Friend request accepted successfully');
    } catch (error) {
        console.error('Error uploading updated user data:', error);
        throw error;
    }
}

/**
 * Check if userA is following userB.
 * @param {string} userAEmail 
 * @param {string} userBEmail 
 * @returns {Promise<boolean>} true if userA is following userB
 */
async function isFollowing(userAEmail, userBEmail) {
    const userA = await searchUserByEmail(userAEmail);
    if (!userA || !userA.followingList) {
        return false;
    }
    return userA.followingList.includes(userBEmail.toLowerCase().trim());
}

/**
 * Send a follow back request from fromUserEmail to toUserEmail.
 * This is essentially sending a friend request.
 * @param {string} fromUserEmail
 * @param {string} toUserEmail
 */
async function sendFollowBackRequest(fromUserEmail, toUserEmail) {
    console.log(`Sending follow back request: ${fromUserEmail} -> ${toUserEmail}`);
    try {
        // Reuse sendFriendRequest function
        await sendFriendRequest(fromUserEmail, toUserEmail);
        console.log(`Follow back request sent successfully: ${fromUserEmail} -> ${toUserEmail}`);
    } catch (error) {
        console.error('Error sending follow back request:', error);
        throw error;
    }
}

/**
 * Get notifications for a user.
 * @param {string} userEmail 
 * @returns {Promise<Array>} notifications array
 */
async function getUserNotifications(userEmail) {
    const user = await searchUserByEmail(userEmail);
    return user && user.notifications ? user.notifications : [];
}

/**
 * Save chat message to Pinata as a JSON file.
 * @param {string} from
 * @param {string} to
 * @param {string} message
 * @param {string} timestamp
 * @returns {Promise<Object>} Pinata response JSON
 */
async function saveMessageToPinata(from, to, message, timestamp) {
    try {
        // Create message object
        const msgObj = {
            from,
            to,
            message,
            timestamp
        };

        // Create a JSON file for the message
        const jsonData = JSON.stringify(msgObj);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const fileName = `chat_${from}_to_${to}_${Date.now()}.json`;
        const file = new File([blob], fileName, { type: 'application/json', lastModified: Date.now() });

        const formData = new FormData();
        formData.append('file', file);

        const metadata = JSON.stringify({
            name: `chat_message_${from}_to_${to}`,
            keyvalues: {
                from,
                to,
                type: 'chat_message'
            }
        });
        formData.append('pinataMetadata', metadata);

        const options = JSON.stringify({
            cidVersion: 0
        });
        formData.append('pinataOptions', options);

        const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
            method: 'POST',
            headers: {
                'pinata_api_key': PINATA_API_KEY,
                'pinata_secret_api_key': PINATA_SECRET_API_KEY
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to upload chat message to Pinata:', errorText);
            throw new Error('Failed to upload chat message to Pinata');
        }

        const data = await response.json();
        console.log('Chat message uploaded to Pinata:', data.IpfsHash);
        return data;
    } catch (error) {
        console.error('Error uploading chat message to Pinata:', error);
        throw error;
    }
}

/**
 * Fetch chat messages between two users from Pinata.
 * @param {string} userAEmail
 * @param {string} userBEmail
 * @returns {Promise<Array>} Array of message objects
 */
async function getChatMessages(userAEmail, userBEmail) {
    try {
        const pinnedFiles = await fetchPinnedFiles('chat_message');
        const chatFiles = pinnedFiles.filter(file => {
            if (!file.metadata || !file.metadata.keyvalues) return false;
            const kv = file.metadata.keyvalues;
            return (kv.from === userAEmail && kv.to === userBEmail) ||
                   (kv.from === userBEmail && kv.to === userAEmail);
        });

        const messages = [];
        for (const file of chatFiles) {
            try {
                const msgData = await fetchUserData(file.ipfs_pin_hash);
                messages.push({
                    message: msgData.message,
                    from: msgData.from,
                    to: msgData.to,
                    timestamp: msgData.timestamp,
                    direction: msgData.from === userAEmail ? 'sent' : 'received'
                });
            } catch (err) {
                console.error('Error fetching chat message data:', err);
            }
        }

        // Sort messages by timestamp ascending
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return messages;
    } catch (error) {
        console.error('Error fetching chat messages:', error);
        return [];
    }
}

export {
    searchUserByEmail,
    sendFriendRequest,
    acceptFriendRequest,
    getUserNotifications,
    isFollowing,
    sendFollowBackRequest,
    saveMessageToPinata,
    getChatMessages
};
