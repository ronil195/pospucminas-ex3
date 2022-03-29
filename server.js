require('dotenv').config()

const express = require('express')
const bodyParser = require('body-parser');
const app = express()
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken')

const endpoint = '/api'

const knex = require('knex')({
    client: 'pg',
    debug: true,
    connection: {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    }
});

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


// token de seguranca
let checkToken = (req, res, next) => {
    let authToken = req.headers["authorization"]
    if (!authToken) {
        res.status(401).json({ message: 'Token de acesso requerida' })
    }
    else {
        let token = authToken.split(' ')[1]
        req.token = token
    }
    jwt.verify(req.token, process.env.SECRET_KEY, (err, decodeToken) => {
        if (err) {
            res.status(401).json({ message: 'Acesso negado' })
            return
        }
        req.usuarioId = decodeToken.id
        next()
    })
}

// analisar role do usuário
let isAdmin = (req, res, next) => {
    knex
        .select('*').from('usuario').where({ id: req.usuarioId })
        .then((usuarios) => {
            if (usuarios.length) {
                let usuario = usuarios[0]
                let roles = usuario.roles.split(';')
                let adminRole = roles.find(i => i === 'ADMIN')
                if (adminRole === 'ADMIN') {
                    next()
                    return
                }
                else {
                    res.status(403).json({ message: 'Role de ADMIN requerida' })
                    return
                }
            }
        })
        .catch(err => {
            res.status(500).json({
                message: 'Erro ao verificar roles de usuário - ' + err.message
            })
        })
}


// log de execucao
app.use((req, res, next) => {
    console.log(`Log: ${req.hostname} - ${req.url} : ${req.params} : ${req.body}`)
    next();
})

// buscar todos os produtos
app.get(endpoint + '/produtos', checkToken, (req, res) => {
    knex.select('*').from('produto')
        .then(produtos => res.status(200).json(produtos))
        .catch(err => {
            res.status(500).json({
                message: 'Erro ao recuperar produtos - ' + err.message
            })
        })
})


// buscar detalhes de um determinado produto
app.get(endpoint + "/produtos/:id", checkToken, (req, res, next) => {

    let id = parseInt(req.params.id)
    knex.select('*')
        .from('produto')
        .where('id', req.params.id)
        .then((produtos) => {

            if (produtos.length > 0) { res.status(200).json(produtos) }
            else { res.status(404).json({ message: "Produto não encontrado" }) }

        })
        .catch((err) => {
            res.status(500).json({
                message: 'Erro ao recuperar  o produto - ' + err.message
            })
        })

})


// incluir um novo produto
app.post(endpoint + "/produtos", checkToken, isAdmin, (req, res) => {

    knex.select("*")
        .from("produto")
        .where("id", req.body.id)
        .then((produto) => {
            if (produto.length > 0) {
                res.status("404").json({ message: "Produto " + req.body.id + "  já existe" })
            } else {
                knex("produto")
                    .insert({
                        id: req.body.id,
                        descricao: req.body.descricao,
                        valor: req.body.valor,
                        marca: req.body.marca
                    }, ['id'])
                    .then((result) => {
                        let produtos = result[0];
                        res.status(200).json({ message: 'Produto ' + produtos.id + ' incluso com sucesso' })
                    })
                    .catch((err) => {
                        res.status(500).json({
                            message: 'Erro ao recuperar  o produto - ' + err.message
                        })
                    })

            }
        })
        .catch((err) => {
            console.log("produto nao encontrado")
        })

})

// alterar um registro
app.put(endpoint + "/produtos/:id", checkToken, isAdmin, (req, res) => {

    knex("produto")
        .where('id', req.params.id)
        .update({
            descricao: req.body.descricao,
            valor: req.body.valor,
            marca: req.body.marca
        })
        .then((result) => {
            if (result > 0) {
                res.status("200").json({ message: "Registro alterado com sucesso" })
            } else {
                res.status("404").json({ message: "Produto nao encontrado" })

            }

        })
        .catch((err) => {
            res.status(500).json({ message: "Erro ao atualizar o registro:" + err.message })
        })
})


// apagar um registro
app.delete(endpoint + "/produtos/:id", checkToken, isAdmin, (req, res) => {

    knex('produto')
        .where('id', req.params.id)
        .del()
        .then((n) => {
            if (n) {
                res.status(200).json({ message: 'Produtos excluído com sucesso' })
            } else {
                res.status(404).json({ message: 'Produto não encontrado' })
            }
        })
        .catch(err => {
            res.status(500).json({ message: 'Erro ao excluir o produto: ' + err.message })
        })

})


// seguranca
app.post('/seguranca/register', (req, res) => {
    let senhaHash = bcrypt.hashSync(req.body.senha, 8);

    knex('usuario')
        .where("login", req.body.login)
        .then((usuarios) => {
            if (usuarios.length > 0) {
                res.status("404").json({ message: "Usuário " + req.body.login + "  já existe" })
            } else {
                knex('usuario')
                    .insert({
                        nome: req.body.nome,
                        email: req.body.email,
                        login: req.body.login,
                        senha: senhaHash,
                        roles: req.body.roles
                    }, ['id', 'nome', 'email', 'login', 'senha', 'roles'])
                    .then((result) => {
                        let usuario = result[0];
                        res.status(200).json({
                            "id": usuario.id,
                            "nome": usuario.nome,
                            "email": usuario.email,
                            "login": usuario.login,
                            "senha": usuario.senha
                        })
                    })
            }
        })
})


// tem que gerar token jwt
app.post('/seguranca/login', (req, res) => {

    knex('usuario')
        .where('login', req.body.login)
        .then((usuarios) => {

            if (usuarios.length) {
                let usuario = usuarios[0]
                let checkSenha = bcrypt.compareSync(req.body.senha, usuario.senha);
                if (checkSenha) {
                    var tokenJWT = jwt.sign({ id: usuario.id },
                        process.env.SECRET_KEY, {
                        expiresIn: 3600
                    })
                    res.status(200).json({
                        id: usuario.id,
                        login: usuario.login,
                        nome: usuario.nome,
                        roles: usuario.roles,
                        token: tokenJWT
                    })
                    return
                }
            }
            res.status(200).json({ message: 'Login ou senha incorretos' })
        })
        .catch(err => {
            res.status(500).json({
                message: 'Erro autenticação - ' + err.message
            })
        })
})




//let porta = process.env.PORT || 3001;
let porta = 3000;

app.listen(porta, () => {
    console.log("Servidor no ar");
})

