/* Después de descargar nuestros paquetes es necesario requerir los modulos, para ello declaramos las variables,es recomendaod hacerlo con el mismo nombre del paquete*/
const express = require('express');  
const socket = require('socket.io');
const mysql = require('mysql');
const cookieParser = require('cookie-parser');
const session = require('express-session');
/**************************************************/
var app = express(); /*requerimos las funciones de express*/
var roomName = '';
const nameBot = "BotChat";

/*colgamos nuestro servidor y el puerto en el que trabajará*/
var server = app.listen(3030, function () {			
  console.log("Servidor en marcha, port 3030.");
});

/*requerimos las funciones de socket por medio de nuestro servidor*/
var io = socket(server);

/*Configuramos las sesiones*/
var sessionMiddleware = session({				//Definimos middleware para el chat
  secret: "keyUltraSecret",
  resave: true,
  saveUninitialized: true
});
/**************************************/

/*Pasamos las sesiones con el socket*/
io.use(function (socket, next) {
  sessionMiddleware(socket.request, socket.request.res, next);
});
/******************************************************************/

/*Requerimos las funciones de la sesión en app,junto con los sockets ya asignados,así como las funciones de cookieParser*/
app.use(sessionMiddleware);
app.use(cookieParser());
/***************************************/

/*Creamos nuestra conección a nuetsra base de datos*/
const config = {
  "host": "localhost",
  "user": "root",
  "password": "",
  "base": "chat"
};

var db = mysql.createConnection({				//Se configura la conexion a la base de datos de acuerdo a los datos que 
												// creamos en la base con SQL
  host     : 'localhost',
  user     : 'root',
  password : '',
  database : 'chat'
});

db.connect(function (err) {
  if (!!err)
  throw err;

  console.log('MySQL conectado: ' + config.host + ", usuario: " + config.user + ", Base de datos: " + config.base);
});

app.use(express.static('./'));

/*si se logra concectar el socket,comienza a realizar todas las funciones/consultas que vienen debajo*/
io.on('connection', function (socket) {
  var req = socket.request;

  console.log(req.session);

	if(req.session.userID != null){
		db.query("SELECT * FROM users WHERE id=?", [req.session.userID], function(err, rows, fields){
			console.log('Sesión iniciada con el UserID: ' + req.session.userID + ' Y nombre de usuario: ' + req.session.Username);	//Mandamos un mensaje en caso de que se logre iniciar sesion
			socket.emit("logged_in", {user: req.session.Username, email: req.session.correo});	//Mandamos el nombre de usuario, email y correo
		});
	}else{
		console.log('No hay sesión iniciada'); //En el caso contrario, no iniciamos sesion y mandamos mensaje a pantalla
	}

	socket.on("login", function(data){
		console.log(data);
	  const user = data.user,
	  pass = data.pass;
	  roomID = data.roomID;
	  roomName = data.roomName;

	  db.query("SELECT * FROM users WHERE Username=?", [user], function(err, rows, fields){		//buscamos el usuario en la base de datos
		  if(rows.length == 0){
		  	console.log("El usuario no existe, favor de registrarse!");		//Si no existe se pide al cliente que haga un registro
		  }else{
		  		console.log(rows);
		  		
		  		const dataUser = rows[0].Username,			//llena los campos correspondientes al registro de usuarios del chat
			  	dataPass = rows[0].Password,
			  	dataCorreo = rows[0].email;

				if(dataPass == null || dataUser == null){
				  	socket.emit("error");
				}
				if(user == dataUser && pass == dataPass){			//si el usuario estaba registrado entonces mandamos mensaje a pantalla
					console.log("Usuario correcto!");
					socket.emit("logged_in", {user: user, email: dataCorreo, room: roomName, roomID: roomID});
					req.session.userID = rows[0].id;
					req.session.Username = dataUser;
					req.session.correo = dataCorreo;
					req.session.roomID = roomID;
					req.session.roomName = roomName;
					req.session.save();
					socket.join(req.session.roomName);
					socket.emit('armadoHistorial'); //Mandamos la función de armadoHistorial
					console.log(req.session);
					bottxt('entroSala');
				}else{
				  	socket.emit("invalido");
				}
		  }
	  });
	});
    /**************Armamos nuestro historial de cada sala, gracias a esta función y la consulta */
	socket.on('historial', function(){
		console.log('Buscamos historial de la sala: ' + req.session.roomName);

		db.query('SELECT s.nombre_sala, u.Username, m.mensaje FROM mensajes m INNER JOIN salas s ON s.id = m.sala_id INNER JOIN users u ON u.id = m.user_id WHERE m.sala_id = ' + req.session.roomID + ' ORDER BY m.id ASC', function(err, rows, fields){
			socket.emit('armadoHistorial', rows);
			console.log(rows);
		});
	});
	
	socket.on('addUser', function(data){
		const user = data.user,
		pass = data.pass,
		email = data.email;
		
		if(user != "" && pass != "" && email != ""){
			console.log("Registrando el usuario: " + user);
		  	db.query("INSERT INTO users(`Username`, `Password`, `email`) VALUES(?, ?, ?)", [user, pass, email], function(err, result){  //Añadimos los valores del usuario a la base de datos
			  if(!!err)
			  throw err;

			  console.log(result);

			  console.log('Usuario ' + user + " se dio de alta correctamente!."); //Avisamos al usuario que su registro fue un éxito
			  socket.emit('UsuarioOK');
			});
		}else{
			socket.emit('vacio');
		}
	});
	/*Obtenemos id y nombre dependiendo de la sala a la que cmabiamos*/
	socket.on('cambioSala', function(data){
		const idSala = data.idSala,
		nombreSala = data.nombreSala;
		
		socket.leave(req.session.roomName);

		req.session.roomID = idSala;
		req.session.roomName = nombreSala;

		socket.join(req.session.roomName);
		bottxt('cambioSala');
	});

	socket.on('mjsNuevo', function(data){ // Funcion para el mensaje
		 //La consulta es muy importante, ya que de no estar bien, no guardara mensajes
			db.query("INSERT INTO mensajes(`mensaje`, `user_id`, `sala_id`, `fecha`) VALUES(?, ?, ?, CURDATE())", [data, req.session.userID, req.session.roomID], function(err, result){
			  if(!!err)
			  throw err;

			  console.log(result);

			  console.log('Mensaje dado de alta correctamente!.');
			  
			  		socket.broadcast.emit('mensaje', {
						usuario: req.session.Username,
						mensaje: data
					});
					
					socket.emit('mensaje', {
						usuario: req.session.Username,
						mensaje: data
					});
			});
		
	});
	
	socket.on('getSalas', function (data) { //obtenemos la sala
		db.query('SELECT id, nombre_sala FROM salas', function(err, result, fields){
			if(err) throw err;
            socket.emit('Salas', result);
		});
    });

	socket.on('salir', function(request, response){
		req.session.destroy(); //destruimos la sesión
	});
    
	/*Creamos una función de un bot que nos da la bienvenida o nos dice a que sala cambiamos*/
	function bottxt(data){
		entroSala = 'Bienvenido a la sala ' + req.session.roomName;
		cambioSala = 'Cambiaste de sala a ' + req.session.roomName;
		sefue = 'El usuario ' + req.session.Username + 'ha salido de sala.'
		
		if(data == "entroSala"){
			socket.emit('mensaje',{
				usuario: nameBot,
				mensaje: entroSala
			});
		}
		if(data == "cambioSala"){
			socket.emit('mensaje',{
				usuario: nameBot,
				mensaje: cambioSala
			});
		}
		if(data == "salioUsuario"){
			socket.emit('mensaje',{
				usuario: nameBot,
				mensaje: sefue
			});
		}
	}
	
	app.post('/auth', function(request, response) {//Recibimos la autenticacion
		var username = request.body.username;	//se obtienen datos del usuario
		var password = request.body.password;

		if(username && password){ //Se revisa si los datos estan vacíos o no

			//Se realiza una consulta para checar usuario y passwd
			connnection.query('SELECT * FROM users WHERE username = ? AND password = ?' [username, password], function (err, results, fields){
				if(results.length > 0){ 
					request.session.loggedin = true; //asignamos true al loggedin
					request.session.username = username;
					response.redirect('/home'); //Redireccionamos a la ruta de home
				} else{ //Si el result da 0, el usuario no se encontro y mandamos mensaje a pantalla
					response.send('Usuarios y/o contraseña incorrectos');
				}
				response.end();
			});
		} else {
			response.send('Ingresa usuario y contraseña');
			response.end(); //Terminamos el proceso
		}
	});
});