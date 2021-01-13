const userRouter = require('express').Router();
const userFacade = require('./userFacade');
const responseHandler = require('../responseHandler');
const validators = require('./userValidators')
const jwtHandler = require('../jwtHandler');

//  User Login
userRouter.route('/loginUser').post((req, res) => {
    userFacade.loginUser(req).then(result => {
        responseHandler.successResponse(res, result);
    }).catch(err => {
        responseHandler.errorHandler(res, err);
    });
});

//  User Signup Step 1
userRouter.route('/signupUserStep1').post((req, res) => {
    userFacade.signupUserStep1(req).then(result => {
        responseHandler.sendSuccess(res, result);
    }).catch(err => {
        console.log(err)
        responseHandler.sendError(res, err);
    });
});

//  User Signup Step 2
userRouter.route('/signupUserStep2/:userId').post((req, res) => {
    userFacade.signupUserStep2(req).then(result => {
        responseHandler.sendSuccess(res, result);
    }).catch(err => {
       
        responseHandler.sendError(res, err);
    });
});

//  User Signup Step 3
userRouter.route('/signupUserStep3/:userId').post((req, res) => {
    userFacade.signupUserStep3(req).then(result => {
        responseHandler.successResponse(res, result);
    }).catch(err => {
        console.log({err})
        responseHandler.errorHandler(res, err);
    });
});

//  Forget Password
userRouter.route('/forgetPassword').post((req, res) => {
    userFacade.forgetPassword(req).then(result => {
        responseHandler.sendSuccess(res, result);
    }).catch(err => {
        responseHandler.sendError(res, err);
    });
});

//  Reset Password
userRouter.route('/resetPassword').post((req, res) => {
    userFacade.resetPassword(req).then(result => {
        responseHandler.sendSuccess(res, result);
    }).catch(err => {
        responseHandler.sendError(res, err);
    });
});

//  Get Profile
userRouter.route('/getProfile/:userId').get([validators.verifyUserToken, jwtHandler.checkBlacklistToken], (req, res) => {
    userFacade.getProfile(req).then(result => {
        responseHandler.sendSuccess(res, result);
    }).catch(err => {
        responseHandler.sendError(res, err);
    });
});

//  Edit Profile
userRouter.route('/editProfile/:userId').post([validators.verifyUserToken, jwtHandler.checkBlacklistToken], (req, res) => {
    userFacade.editProfile(req).then(result => {
        responseHandler.sendSuccess(res, result);
    }).catch(err => {
        responseHandler.sendError(res, err);
    });
});

//  Edit Profile Picture
userRouter.route('/editProfilePicture/:userId').post([jwtHandler.checkBlacklistToken], (req, res) => {
    userFacade.editProfilePicture(req).then(result => {
        console.log({result})
        responseHandler.sendSuccess(res, result);
    }).catch(err => {
        console.log({err})
        responseHandler.sendError(res, err);
    });
});

//  User Delete Accout
userRouter.route('/deleteAccount/:userId').get([validators.verifyUserToken, jwtHandler.checkBlacklistToken], (req, res) => {
    userFacade.deleteAccount(req).then(result => {
        responseHandler.sendSuccess(res, result);
    }).catch(err => {
        responseHandler.sendError(res, err);
    });
});

//  User Logout
userRouter.route('/logoutUser').get((req, res) => {
    userFacade.logoutUser(req).then(result => {
        responseHandler.sendSuccess(res, result);
    }).catch(err => {
        responseHandler.sendError(res, err);
    });
});

/**for fetch unread notificaitons for user */
userRouter.route('/notificationsList/:userId')
    .get([validators.verifyUserToken,jwtHandler.checkBlacklistToken],(req,res) => {

        userFacade.getNotificationsList(req, res).then((result) => {
            responseHandler.sendSuccess(res, result)

        }).catch((err) => {
            responseHandler.sendError(res, err)
        })
    })


/**for update notificaion preference */
userRouter.route('/notificationPreference/:userId')
    .put([validators.verifyUserToken,jwtHandler.checkBlacklistToken,validators.validateNotificationPreferenceRequest],(req,res) => {

        userFacade.updatePreferences(req,res).then((result) => {
            responseHandler.sendSuccess(res,result)

        }).catch((err) => {
            responseHandler.sendError(res, err)
        })
    })

/**for get notificaion preference */
userRouter.route('/notificationPreference/:userId')
    .get([validators.verifyUserToken,jwtHandler.checkBlacklistToken],(req,res) => {

        userFacade.getNotificationPreference(req, res).then((result) => {
            responseHandler.sendSuccess(res, result)

        }).catch((err) => {
            responseHandler.sendError(res, err)
        })
    })

/**for get trade fund preference */
userRouter.route('/tradeFundPreference/:userId')
    .get([validators.verifyUserToken,jwtHandler.checkBlacklistToken],(req,res) => {

        userFacade.getTradeFundPreference(req,res).then((result) => {
            responseHandler.sendSuccess(res,result)

        }).catch((err) => {
            responseHandler.sendError(res,err)
        })
    })

/**for update trade fund preference */
userRouter.route('/tradeFundPreference/:userId')
    .put([validators.verifyUserToken,jwtHandler.checkBlacklistToken,validators.validateTradeFundPreferenceRequest],(req,res) => {

        userFacade.updatePreferences(req,res).then((result) => {
            responseHandler.sendSuccess(res,result)

        }).catch((err) => {
            responseHandler.sendError(res,err)
        })
    })

/**for get terms and policy */
userRouter.route('/termsAndPolicy/:userId')
    .get([validators.verifyUserToken,jwtHandler.checkBlacklistToken],(req,res) => {

        userFacade.getTermsAndPolicy(req).then((result) => {
            responseHandler.sendSuccess(res,result)

        }).catch((err) => {
            responseHandler.sendError(res,err)
        })
    })

/**for contact us request */
userRouter.route('/contactUs/:userId')
    .post([validators.verifyUserToken,jwtHandler.checkBlacklistToken,validators.validateContactUsRequest],(req,res) => {

        userFacade.addcontactUs(req).then((result) => {
            responseHandler.sendSuccess(res,result)

        }).catch((err) => {
            responseHandler.sendError(res,err)
        })
    })

//deeplink
userRouter.route('/deepLink').get((req, res) => {
    res.sendFile(process.cwd() + '/lib/deepLinking.html')
})
//terms and condition
userRouter.route('/terms&condition').get((req, res) => {
    res.sendFile(process.cwd() + '/lib/termsAndCondition.html')
})

/**for resend verification code */
userRouter.route('/resendCode/:userId')
    .get((req,res) => {

        userFacade.resendCode(req).then((result) => {
            responseHandler.sendSuccess(res,result)

        }).catch((err) => {
            console.log(err)
            responseHandler.sendError(res,err)
        })
    })

    /**for check link time */
userRouter.route('/checkResetLink/:emailId')
.get((req,res) => {

    userFacade.checkResetLink(req).then((result) => {
        responseHandler.sendSuccess(res,result)

    }).catch((err) => {
        console.log(err)
        responseHandler.sendError(res,err)
    })
})

userRouter.route("/image/:name").get((req, res) => {
    res.sendFile(__dirname+"/images/"+req.params.name);
  });

module.exports = userRouter;