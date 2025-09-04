/**
 * fixFollowersList.js
 * 
 * Script to fix user data JSON files on Pinata by ensuring followersList array is present and consistent.
 * 
 * Usage: node fixFollowersList.js
 */

const fetch = require('node-fetch');
const FormData = require('form-data');

const PINATA_API_KEY = '3a9e81513e7c81e26d11';
const PINATA_SECRET_API_KEY = '2a937c360d5e3f5a4c18967830e92e0e2568e103479743ef8831d87c90eed9a8';

async function fetchPinnedFiles() {
    const url = `https://api.pinata.cloud/data/pinList?includeCount=false&status=pinned`;
    const response = await fetch(url, {
        headers: {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_API_KEY
        }
    });
    if (!response.ok) {
        throw new Error('Failed to fetch pinned files from Pinata');
    }
    const data = await response.json();
    return data.rows || [];
}

async function fetchUserData(ipfsHash) {
    const response = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
    if (!response.ok) {
        throw new Error('Failed to fetch user data JSON from IPFS');
    }
    return await response.json();
}

async function uploadUserData(userData, userEmail) {
    const updatedJsonData = JSON.stringify(userData);
    const blob = Buffer.from(updatedJsonData, 'utf-8');

    const formData = new FormData();
    formData.append('file', blob, {
        filename: `${userEmail}.json`,
        contentType: 'application/json'
    });

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
        throw new Error('Failed to upload user data JSON to Pinata: ' + errorText);
    }

    return await response.json();
}

async function fixFollowersList() {
    try {
        console.log('Fetching pinned files...');
        const pinnedFiles = await fetchPinnedFiles();

        // Filter user registration data files
        const userFiles = pinnedFiles.filter(file =>
            file.metadata &&
            file.metadata.keyvalues &&
            file.metadata.keyvalues.type === 'registration_data'
        );

        console.log(`Found ${userFiles.length} user registration files.`);

        for (const userFile of userFiles) {
            const email = userFile.metadata.keyvalues.email;
            console.log(`Processing user: ${email}`);

            try {
                const userData = await fetchUserData(userFile.ipfs_pin_hash);

                let updated = false;

                if (!userData.followersList) {
                    userData.followersList = [];
                    updated = true;
                    console.log(`Initialized empty followersList for ${email}`);
                }

                // Optional: If followersCount > 0 but followersList is empty, log warning
                if (userData.followersCount > 0 && userData.followersList.length === 0) {
                    console.warn(`Warning: ${email} has followersCount > 0 but empty followersList.`);
                    // Could implement logic to infer followersList here if data available
                }

                if (updated) {
                    const uploadResult = await uploadUserData(userData, email);
                    console.log(`Uploaded updated user data for ${email}: ${uploadResult.IpfsHash}`);
                } else {
                    console.log(`No update needed for ${email}`);
                }
            } catch (err) {
                console.error(`Error processing user ${email}:`, err);
            }
        }

        console.log('Followers list fix completed.');
    } catch (error) {
        console.error('Error in fixFollowersList:', error);
    }
}

fixFollowersList();
