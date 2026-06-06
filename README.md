# Decentralized Will Platform

A blockchain-enabled digital will platform built to let users create, encrypt, and store wills securely. The system uses smart contracts, IPFS, and an Express/MongoDB backend to protect digital inheritance and automate execution.

## Project Structure

- `frontend/`
  - Static HTML/CSS/JS UI for home, login, registration, dashboard, will creation, and About Us pages
- `backend/`
  - Node.js + Express API with authentication, will management, encryption, and MongoDB persistence
- `contracts/`
  - Hardhat smart contract project for on-chain will deployment and execution logic

## Key Features

- Secure user sign up and login
- Encrypted will creation and storage
- Smart contract-based will execution
- IPFS support for decentralized file storage
- UI dashboard for managing digital wills
- About page with team information

## Technologies

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express, MongoDB, Mongoose
- Authentication: JWT, bcryptjs
- Security: helmet, express-rate-limit, express-mongo-sanitize
- Storage: IPFS via `ipfs-http-client`
- Smart Contracts: Hardhat, Solidity

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MongoDB instance or MongoDB Atlas cluster

### Run the Backend

```bash
cd backend
npm install
cp .env.example .env
# update .env with MongoDB URI, JWT secret, and email settings if needed
npm run dev
```

### Compile and Deploy Smart Contracts

```bash
cd contracts
npm install
npx hardhat compile
# add deploy network and configuration as needed
```

### Open the Frontend

The frontend is static and can be opened directly in the browser or served from a web server.

```bash
cd frontend
# open index.html in your browser
```

## Notes

- The backend currently uses an API server in `backend/server.js`.
- The `frontend/about.html` page includes a team section with placeholder locations for GitHub URLs and member pictures.
- For production, serve the frontend through a static server and secure backend environment variables.

## Team

- DJAMILATOU NAJMA BELLO — Scrum Master, Cybersecurity
- MOULIOM MEFIRE MIKE LUCAS — Product Owner, ISN
- NYETAM BASSONG JEREMIE CHARLES — CTO
- NDENGUE TAMOKOUE VAN BROWN — Software Engineering
- ASONGWE TONY KHAN — ISN

## License

This project is available under the MIT License. Feel free to customize and build on it.
