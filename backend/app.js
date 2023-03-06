require('dotenv').config();
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const CookieStrategy = require("passport-cookie");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require('bcryptjs');
const MongoStore = require('connect-mongo');


//Mongo connection
const mongoDb=process.env.MONGODB;
mongoose.connect(mongoDb, { useUnifiedTopology: true, useNewUrlParser: true });
const db = mongoose.connection;
db.on("error", console.error.bind(console, "mongo connection error"));

const User = mongoose.model(
  "User",
  new Schema({
    username: { type: String, required: true },
    password: { type: String, required: true },
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    member: { type: Boolean, required: true },
    admin: { type: Boolean, required: false },
  })
);

const Message = mongoose.model(
    "Message",
    new Schema({
      email: { type: String, required: true },
      title: { type: String, required: true },
      firstname: { type: String, required: true },
      lastname: { type: String, required: true },
      timestamp: { type: Date, required: true },
      message: { type: String, required: true },
    })
  );

//Passport config
passport.use(
    new LocalStrategy((username, password, callback) => {
        User.findOne({username: username})
        .then(user => {
            if(!user) {
                return callback(null, false, {message: "Incorrect username" });
            }
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) {
                  // passwords match! log user in
                  return callback(null, user)
                } else {
                  // passwords do not match!
                  return callback(null, false, { message: "Incorrect password" })
                }
              })
        })
        .catch(err=> {
            console.error('error loging in');
            return callback(err);
        });

    })
);

passport.serializeUser(function(user, cb) {
    process.nextTick(function() {
        cb(null, {id: user.id, email: user.username, firstname:user.firstname, lastname:user.lastname, member:user.member, admin:user.admin});
    });
});

passport.deserializeUser(function(user, cb) {
    process.nextTick(function() {
        return cb(null, user);
    });
});

const app = express();
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: "cats", store: new MongoStore({
    mongoUrl: mongoDb,
    secret: 'cats',
}), cookie: { maxAge: 864000000 }, rolling: true, resave: true, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());


// Routes
// app.get('/', async function(req, res, next) {
//     let user=req.user;
//     if(!user)user=req.session.user;
//     console.log('user: ', user);
//     let posts=undefined;
//     posts = await Message.find({});

//     if(user && !user.member)posts.forEach(x=> {
//         x.firstname=undefined;
//         x.lastname=undefined;
//         x.timestamp=undefined;
//         x.email=undefined;
//         x._id=undefined;
//     });
//     res.render('index', { title: 'MembersOnly', user: user, posts: posts });
// });

app.get('/', async function(req, res, next) {

    res.render('index', { title: 'MembersOnly', user: undefined, posts: undefined });
});


// Signup
app.get('/signup', (req, res, next) => {
    let isTaken=false;
    if(req.isTaken)isTaken=true;
    console.log('req.isTaken: ', req.isTaken);
    res.render('signup', { title: 'Sign up', isTaken:false });
  });
// app.post("/signup", (req, res, next) => {
//     bcrypt.hash(req.body.password, 10, async (err, hashed) => {
//         if(err) {
//             console.error('error');
//             return next(err);
//         }
//         //Check if email already in use
//         const isTaken = await User.findOne({username: req.body.email}).exec()
//         if(isTaken) {
//             res.locals.isTaken=true;
//             res.redirect('/signup');
//         } else {
//             const user = new User({
//                 firstname: req.body.firstName,
//                 lastname: req.body.lastName,
//                 username: req.body.email,
//                 password: hashed,
//                 member: false,
//                 admin: false,
//             }).save()
//             .then(user=> {
//                 req.session.context=user;
//                 res.redirect('/');
//                 next();
//             });
//         }
        
//     })
// });
app.post("/signup", checkSignup, emailTaken);

async function checkSignup(req, res, next) {
    const isTaken = await User.findOne({username: req.body.email}).exec()
        if(isTaken) {
            return next();
        } else {
            bcrypt.hash(req.body.password, 10, async (err, hashed) => {
                if(err) {
                    console.error('error');
                    return next(err);
                }
                const user = new User({
                    firstname: req.body.firstName,
                    lastname: req.body.lastName,
                    username: req.body.email,
                    password: hashed,
                    member: false,
                    admin: false,
                }).save()
                .then(user=> {
                    console.log('user after signup: ', user);
                    req.session.user=user;
                    res.redirect('/');
                    // next();
                });
            });            
        }
}
function emailTaken(req, res, next) {
    res.render('signup', { title: 'Sign up', isTaken:true });
}
// Log in
app.get('/login', (req, res, next) => {
    res.render('login', { title: 'Log In' });
  });
app.post('/login', passport.authenticate('local', {
    failureRedirect: '/oops',
    failureMessage: true,
    }),
    (req, res, next) => {
        req.session.user=req.user;
        res.redirect('/');
    }
);
// Log out
app.get('/logout', (req, res, next) => {
    req.session.destroy(e=> {
        if(e)return next(e);
        res.redirect('/');
    });
  });
//Post message
app.get('/message', (req, res, next) => {
    res.render('message', { title: 'New Post' });
});
app.post('/message', isLoggedIn, (req, res, next) => {
    const firstname = req.user.firstname;
    const lastname = req.user.lastname;
    const email = req.user.email;
    const id = req.user.id;
    const title = req.body.title;
    const message = req.body.message;
    const timestamp = new Date();

    //Send data to DB:
    const msg = new Message({
        firstname: firstname,
        lastname: lastname,
        email: email,
        title: title,
        timestamp: timestamp,
        message: message,
    }).save()
    .then(result=> {
        res.redirect('/');
    });
    
});
function isLoggedIn(req, res, next) {
    if(req.isAuthenticated())return next();
    if(req.session.user)return next();
    res.redirect('/');
}
 //Members
 app.get('/member',isLoggedIn, (req, res, next) => {
    const isMember=req.session.user.member;
    res.render('member', { title: 'Exclusive Club', member: isMember });
});


app.post('/member', isLoggedIn, async (req, res, next) => {
    const answer=req.body.member.toLowerCase();
    if(answer==='the odin project' || answer==='top') {
        //success
        const user = req.user;
        user.member=true;
        const findUser = await User.findOne({username:user.email}).exec();
        findUser.member=true;
        findUser.save();
        res.render('member', { title: 'Exclusive Club', member: true });
        
    } else {
        res.render('member', { title: 'Exclusive Club', member: false, wrong:true });
    }
});

app.delete("/deletePost", isLoggedIn, async (req, res, next) => {
    if(!req.session.user.admin)return next();
    console.log('In delete post, ', req.body);
    await Message.deleteOne({_id:req.body.value});
    res.redirect('/');
});


// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
  });
// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});


module.exports = app;
