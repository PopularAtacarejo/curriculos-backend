const express = require('express');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const {
  GITHUB_USER,
  REPO_NAME,
  BRANCH,
  TOKEN,
  CURRICULO_DIR
} = process.env;

const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `token ${TOKEN}`,
    Accept: 'application/vnd.github.v3+json'
  }
});

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = './temp';
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

async function getFileSha(path) {
  try {
    const res = await githubApi.get(`/repos/${GITHUB_USER}/${REPO_NAME}/contents/${path}`);
    return res.data.sha;
  } catch (err) {
    return null;
  }
}

async function uploadFileToGitHub(filePath, githubPath, message) {
  const content = fs.readFileSync(filePath, { encoding: 'base64' });
  const sha = await getFileSha(githubPath);

  await githubApi.put(`/repos/${GITHUB_USER}/${REPO_NAME}/contents/${githubPath}`, {
    message,
    content,
    branch: BRANCH,
    ...(sha && { sha })
  });
}

app.post('/api/enviar', upload.single('arquivo'), async (req, res) => {
  try {
    const dados = req.body;
    const arquivo = req.file;
    const dataEnvio = new Date().toISOString();
    const nomeArquivo = `${Date.now()}-${arquivo.originalname}`;
    const githubFilePath = `${CURRICULO_DIR}/${nomeArquivo}`;

    await uploadFileToGitHub(arquivo.path, githubFilePath, `Adiciona currículo de ${dados.nome}`);

    const jsonPath = 'dados.json';
    let registros = [];

    try {
      const response = await githubApi.get(`/repos/${GITHUB_USER}/${REPO_NAME}/contents/${jsonPath}`);
      const content = Buffer.from(response.data.content, 'base64').toString();
      registros = JSON.parse(content);
    } catch (e) {
      registros = [];
    }

    const novoRegistro = {
      ...dados,
      arquivo: `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/${BRANCH}/${githubFilePath}`,
      data: dataEnvio
    };

    registros.push(novoRegistro);

    const jsonLocalPath = './temp/dados.json';
    fs.writeFileSync(jsonLocalPath, JSON.stringify(registros, null, 2));
    await uploadFileToGitHub(jsonLocalPath, jsonPath, `Atualiza dados.json com currículo de ${dados.nome}`);

    fs.unlinkSync(arquivo.path);
    res.status(200).send({ mensagem: 'Currículo enviado com sucesso.' });

  } catch (error) {
    console.error(error);
    res.status(500).send({ erro: 'Erro ao enviar currículo.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
