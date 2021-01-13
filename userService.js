const mongoose = require("mongoose");
const dao = require("../dao/baseDao");
const userDao = require("./userDao");
const bcrypt = require("bcryptjs");
const s3Bucket = require("../common/refrence");
const jwt = require("jsonwebtoken");
const userModel = require("../generic/models/userModel");
const userMaster = mongoose.model("tb_userMaster", userModel.userMasterSchema);
const blackListModel = require("../generic/models/blackListTokenModel");
const blackListMaster = mongoose.model(
  "tb_blackListToken",
  blackListModel.blackListMasterSchema
);
const userMapper = require("./userMapper");
const userConst = require("./userConstants");
const constants = require("../constants");
const fs = require("fs");
const appUtils = require("../appUtils");

//  User Login
function loginUser(req) {
  let userMasterDao = new dao(userMaster);
  let query = {
    tb_user_email: req.body.usr_email,
  };
  return userMasterDao
    .findOne(query)
    .then(async (result) => {
      if (result) {
        if (result.tb_user_email_verified == true) {
          if (result.tb_user_set_password == true) {
            let passwordMatch = await bcrypt.compareSync(
              req.body.usr_pass,
              result.tb_user_password
            );
            if (passwordMatch) {
              result = result.toObject();
              let token = jwt.sign(
                {
                  _id: result._id,
                },
                process.env.user_secret,
                {
                  expiresIn: "1 day",
                }
              );
              let update = {
                $set: {
                  tb_user_device_id: req.body.usr_device_id,
                  tb_user_fcm_token: req.body.usr_fcm_token,
                },
              };
              await userMasterDao
                .findOneAndUpdate(query, update, { new: true })
                .then(async (data) => {
                  if (data) {
                    console.log("FCM Token and Device Id Saved");
                  } else {
                    console.log("Failed to Save FCM Token and Device Id");
                  }
                });
              let returnObj = {
                user: result,
                token: token,
              };
              return await returnObj;
            } else {
              return { code: 2, result };
            }
          } else {
            return { code: 3, result };
          }
        } else {
          return { code: 4, result };
        }
      } else {
        return { code: 1, result };
      }
    })
    .catch((err) => {
      return err;
    });
}

//  User Signup Step 1
function signupUserStep1(req) {
  let query = {
    $or: [
      { tb_user_email: req.body.tb_user_email },
      { tb_user_mobile: req.body.tb_user_mobile },
    ],
  };
  return userDao.getProfile(query).then((result) => {
    if (!result) {
      var verificationCode = Math.floor(
        Math.random() * (999999 - 100000) + 100000
      );
      let verificationCodeForSms = Math.floor(
        Math.random() * (999999 - 100000) + 100000
      );

      var mailOptions = {
        from: process.env.gmailAccount,
        to: req.body.tb_user_email,
        subject: "Email Verification",
        html: `<p>Hi,</p><p>Please Verify Your Email.</p><p>Verification Code: <b>${verificationCode}</b>.</p>`,
      };
      let obj = {
        tb_user_firstName: req.body.tb_user_firstName,
        tb_user_lastName: req.body.tb_user_lastName,
        tb_user_email: req.body.tb_user_email,
        tb_user_mobile: req.body.tb_user_mobile,
        tb_user_verificationCode: verificationCode,
        tb_user_verificationCodeForSms: verificationCodeForSms,
        tb_user_verificationCodeTime: Date.now(),
      };
      return userDao.signupUserStep1(obj).then(async (data) => {
        if (data) {
          console.log("User Created Successfully");
          await appUtils.sendMail(mailOptions);
          let message =
            userConst.MESSAGE.smsVerifiactionMessage + verificationCodeForSms;
          await appUtils.sendSms({
            mobileNumber: req.body.tb_user_mobile,
            message,
          });
          let responseObj = Object.assign({}, data._doc);
          delete responseObj.tb_user_verificationCode;
          delete responseObj.tb_user_verificationCodeTime;

          return userMapper.responseMappingWithData(
            userConst.CODE.Success,
            userConst.MESSAGE.successUserCreated,
            responseObj
          );
        } else {
          return userMapper.responseMapping(
            userConst.CODE.BadRequest,
            userConst.MESSAGE.userCreateError
          );
        }
      });
    } else {
      if (result.tb_user_email == req.body.tb_user_email) {
        return userMapper.responseMapping(
          userConst.CODE.BadRequest,
          userConst.MESSAGE.userExist
        );
      } else {
        return userMapper.responseMapping(
          userConst.CODE.BadRequest,
          userConst.MESSAGE.mobileExist
        );
      }
    }
  });
}

//  User Signup Step 2
async function signupUserStep2(req) {
  let query = {
    _id: req.params.userId,
  };
  return userDao.getProfile(query).then((result) => {
    if (result) {
      if (
        result.tb_user_verificationCode == req.body.tb_user_verificationCode
      ) {
        if (
          result.tb_user_verificationCodeForSms ==
          req.body.tb_user_mobileVerificationCode
        ) {
          let oldTime = result.tb_user_verificationCodeTime + 120000;

          if (oldTime >= Date.now()) {
            let update = {
              tb_user_email_verified: true,
            };
            return userDao.signupUser(query, update).then((data) => {
              if (data) {
                data = data.toObject();
                delete data.tb_user_verificationCode;
                delete data.tb_user_password;
                return userMapper.responseMappingWithData(
                  userConst.CODE.Success,
                  userConst.MESSAGE.emailVerified,
                  data
                );
              } else {
                return userMapper.responseMapping(
                  userConst.CODE.BadRequest,
                  userConst.MESSAGE.emailNotVerified
                );
              }
            });
          } else {
            return userMapper.responseMapping(
              userConst.CODE.NotImplemented,
              userConst.MESSAGE.otpExpired
            );
          }
        } else {
          return userMapper.responseMapping(
            userConst.CODE.BadRequest,
            userConst.MESSAGE.invalidMobileOTP
          );
        }
      } else {
        return userMapper.responseMapping(
          userConst.CODE.BadRequest,
          userConst.MESSAGE.invalidOTP
        );
      }
    } else {
      return userMapper.responseMapping(
        userConst.CODE.BadRequest,
        userConst.MESSAGE.notExist
      );
    }
  });
}

//  User Signup Step 3
async function signupUserStep3(req) {
  let query = {
    _id: req.params.userId,
    tb_user_email_verified: true,
  };
  let password = await bcrypt.hashSync(req.body.tb_user_password, 10);
  let update = {
    tb_user_password: password,
    tb_user_set_password: true,
    tb_user_device_id: req.body.tb_user_device_id,
    tb_user_fcm_token: req.body.tb_user_fcm_token,
  };
  let token = jwt.sign(
    {
      _id: req.params.userId,
    },
    process.env.user_secret,
    {
      expiresIn: "1 day",
    }
  );

  return userDao.signupUser(query, update).then((data) => {
    if (data) {
      console.log("Set Password Successfully");
      data = data.toObject();
      delete data.tb_user_verificationCode;
      delete data.tb_user_password;
      let returnObj = {
        user: data,
        token: token,
      };
      return userMapper.successLoginMapper(returnObj);
    } else {
      return userMapper.passwordNotSetMapper();
    }
  });
}

//  Forget Password
async function forgetPassword(req) {
  let query = {
    tb_user_email: req.body.usr_email,
  };
  return userDao.getProfile(query).then(async (data) => {
    if (data) {
      var randomPassword = Math.random().toString(36).slice(-8);
      var passwordUrl = process.env.passwordUrl;
      var isFromForgotPassword = true;
      var Url = `${passwordUrl}=${randomPassword}&email=${req.body.usr_email}&isFromForgotPassword=${isFromForgotPassword}`;

      let usr_pass = await bcrypt.hashSync(randomPassword, 10);
      let update = {
        tb_user_password: usr_pass,
        tb_user_passwordResetTime: Date.now(),
      };
      return userDao.forgotPassword(query, update).then(async (result) => {
        if (result) {
          var mailOptions = {
            from: "kuldip.shukla@codezeros.com",
            to: req.body.usr_email,
            subject: "Reset Password",
            html: `<p>Hi,</p><p>You recently requested to reset your password.Click the button below to reset it</p><a href='${Url}'>Click Me</a>`,
          };
          await appUtils.sendMail(mailOptions);
          return userMapper.responseMappingWithData(
            userConst.CODE.Success,
            userConst.MESSAGE.successEmailSend,
            result
          );
        } else {
          return userMapper.responseMapping(
            userConst.CODE.BadRequest,
            userConst.MESSAGE.inValidMailId
          );
        }
      });
    } else {
      return userMapper.responseMapping(
        userConst.CODE.BadRequest,
        userConst.MESSAGE.notExist
      );
    }
  });
}

//  Reset Password
function resetPassword(req) {
  let query = {
    tb_user_email: req.body.usr_email,
  };
  return userDao.getProfile(query).then(async (data) => {
    if (data) {
      let passwordMatch = await bcrypt.compareSync(
        req.body.usr_pass,
        data.tb_user_password
      );
      if (passwordMatch) {
        let newPassword = await bcrypt.hashSync(req.body.new_usr_pass, 10);
        let update = {
          tb_user_password: newPassword,
        };
        return userDao.resetPassword(query, update).then(async (result) => {
          if (result) {
            return userMapper.responseMappingWithData(
              userConst.CODE.Success,
              userConst.MESSAGE.successResetPassword,
              result
            );
          } else {
            return userMapper.responseMapping(
              userConst.CODE.BadRequest,
              userConst.MESSAGE.errorInResetPassword
            );
          }
        });
      } else {
        return userMapper.responseMapping(
          userConst.CODE.BadRequest,
          userConst.MESSAGE.passwordResetLinkExpired
        );
      }
    } else {
      return userMapper.responseMapping(
        userConst.CODE.BadRequest,
        userConst.MESSAGE.notExist
      );
    }
  });
}

//  Get Profile
function getProfile(req) {
  let query = {
    _id: req.params.userId,
  };
  return userDao.getProfile(query).then(async (result) => {
    if (result) {
      return userMapper.responseMappingWithData(
        userConst.CODE.Success,
        userConst.MESSAGE.successGetProfileDetail,
        result
      );
    } else {
      return userMapper.responseMapping(
        userConst.CODE.BadRequest,
        userConst.MESSAGE.failedGetProfileDetail
      );
    }
  });
}

//  Edit Profile
async function editProfile(req) {
  let profilePicture = "";
  let query = {
    _id: req.params.userId,
  };
  if (req.body.usr_photo) {
    profilePicture = req.body.usr_photo;
  }
  let update = {
    tb_user_photo: profilePicture,
    tb_user_firstName: req.body.usr_firstName,
    tb_user_lastName: req.body.usr_lastName,
    tb_user_mobile: req.body.usr_mobile,
  };
  return userDao
    .updateProfile(query, update)
    .then(async (result) => {
      if (result) {
        return await userMapper.responseMappingWithData(
          userConst.CODE.Success,
          userConst.MESSAGE.successProfileEdit,
          result
        );
      } else {
        return userMapper.responseMapping(
          userConst.CODE.BadRequest,
          userConst.MESSAGE.failedEditProfile
        );
      }
    })
    .catch((err) => {
      return userMapper.responseMapping(
        userConst.CODE.DataNotFound,
        userConst.MESSAGE.notExist
      );
    });
}

async function editProfilePicture(req, res) {
  return await new Promise(async (resolve, reject) => {
    var re = /(?:\.([^.]+))?$/;
    let filename = req.params.userId+'.'+re.exec(req.files.usr_photo.name)[1];
    let path = __dirname + "/images/" + filename;
    await req.files.usr_photo.mv(path, function (err) {
      if (err) {
        console.log(err);
        reject(
          userMapper.responseMapping(
            userConst.CODE.BadRequest,
            userConst.MESSAGE.failedEditProfilePicture
          )
        );
      } else {
        resolve(
          userMapper.responseMappingWithData(
            userConst.CODE.Success,
            userConst.MESSAGE.successProfilePictureEdit,
           "/image/"+filename
          )
        );
      }
    });
  });
}

function logoutUser(req) {
  let token = req.headers.authorization;
  let query = {
    token: token,
  };
  return userDao.getBlacklistToken(query).then((result) => {
    if (result || result == null) {
      return userDao.addBlacklistToken(query).then(async (tokenResult) => {
        return userMapper.responseMappingWithData(
          userConst.CODE.Success,
          userConst.MESSAGE.successLogout,
          tokenResult
        );
      });
    } else {
      return userMapper.responseMapping(
        userConst.CODE.BadRequest,
        userConst.MESSAGE.failedLogout
      );
    }
  });
}

/**
 * Get all notifications for user
 */
function getNotificationsList(req) {
  let userId = req.params.userId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return userMapper.responseMapping(
      userConst.CODE.BadRequest,
      userConst.MESSAGE.InvalidDetails
    );
  } else {
    let query = {
      receiverId: mongoose.Types.ObjectId(userId),
    };
    return userDao
      .getUserNotifications(query)
      .then(async (result) => {
        await userDao.updateNotification(query, { isRead: true });
        return userMapper.responseMappingWithData(
          userConst.CODE.Success,
          userConst.MESSAGE.Success,
          result
        );
      })
      .catch((e) => {
        console.log({ e });
        return userMapper.responseMapping(
          userConst.CODE.INTRNLSRVR,
          userConst.MESSAGE.internalServerError
        );
      });
  }
}

/**for update preference */

function updatePreferences(req) {
  let userId = req.params.userId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return userMapper.responseMapping(
      userConst.CODE.BadRequest,
      userConst.MESSAGE.InvalidDetails
    );
  } else {
    let userQuery = {
      _id: userId,
      tb_user_isActive: true,
    };
    return userDao.getProfile(userQuery).then((userDetails) => {
      if (!userDetails) {
        return userMapper.responseMapping(
          userConst.CODE.DataNotFound,
          userConst.MESSAGE.InvalidCredentials
        );
      } else {
        return userDao
          .updateProfile(userQuery, req.body)
          .then((userUpdated) => {
            if (userUpdated) {
              return userMapper.responseMapping(
                userConst.CODE.Success,
                userConst.MESSAGE.Success
              );
            } else {
              console.log("Failed to update user");
              return userMapper.responseMapping(
                userConst.CODE.INTRNLSRVR,
                userConst.MESSAGE.internalServerError
              );
            }
          });
      }
    });
  }
}

/**for get notificaion preference */

function getNotificationPreference(req) {
  let userId = req.params.userId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return userMapper.responseMapping(
      userConst.CODE.BadRequest,
      userConst.MESSAGE.InvalidDetails
    );
  } else {
    let userQuery = {
      _id: userId,
      tb_user_isActive: true,
    };
    return userDao.getProfile(userQuery).then((userDetails) => {
      if (!userDetails) {
        return userMapper.responseMapping(
          userConst.CODE.DataNotFound,
          userConst.MESSAGE.InvalidCredentials
        );
      } else {
        let responseData = {
          tb_user_isTradingAlertAllowed:
            userDetails.tb_user_isTradingAlertAllowed,
          tb_user_isExchangeAlertAllowed:
            userDetails.tb_user_isExchangeAlertAllowed,
        };

        return userMapper.responseMappingWithData(
          userConst.CODE.Success,
          userConst.MESSAGE.Success,
          responseData
        );
      }
    });
  }
}

/** Check Blacklist token */
function checkBlackListToken(req) {
  let blackListMasterDao = new dao(blackListMaster);
  return blackListMasterDao.findOne({ token: req.headers.authorization });
}

/**for get trade fund preference */

function getTradeFundPreference(req) {
  let userId = req.params.userId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return userMapper.responseMapping(
      userConst.CODE.BadRequest,
      userConst.MESSAGE.InvalidDetails
    );
  } else {
    let userQuery = {
      _id: userId,
      tb_user_isActive: true,
    };
    return userDao.getProfile(userQuery).then((userDetails) => {
      if (!userDetails) {
        return userMapper.responseMapping(
          userConst.CODE.DataNotFound,
          userConst.MESSAGE.InvalidCredentials
        );
      } else {
        let responseData = {
          tb_user_fund_trade_preference:
            userDetails.tb_user_fund_trade_preference,
        };
        return userMapper.responseMappingWithData(
          userConst.CODE.Success,
          userConst.MESSAGE.Success,
          responseData
        );
      }
    });
  }
}

/**for get trade fund preference */

function getTermsAndPolicy(req) {
  let userId = req.params.userId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return userMapper.responseMapping(
      userConst.CODE.BadRequest,
      userConst.MESSAGE.InvalidDetails
    );
  } else {
    let query = {
      type: userConst.CMS_TYPES.termsAndCondition,
      status: constants.STATUS.active,
    };

    return userDao.getCms(query).then((cms) => {
      if (!cms) {
        return userMapper.responseMappingWithData(
          userConst.CODE.Success,
          userConst.MESSAGE.Success,
          {}
        );
      } else {
        return userMapper.responseMappingWithData(
          userConst.CODE.Success,
          userConst.MESSAGE.Success,
          cms
        );
      }
    });
  }
}

/**for add contact us request*/
function addcontactUs(req) {
  let userId = req.params.userId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return userMapper.responseMapping(
      userConst.CODE.BadRequest,
      userConst.MESSAGE.InvalidDetails
    );
  } else {
    let query = {
      type: userConst.CMS_TYPES.contactUs,
      content: req.body.content,
      subject: req.body.subject,
      createdBy: mongoose.Types.ObjectId(userId),
      createdAt: new Date().getTime(),
    };

    return userDao.addContactUs(query).then((cms) => {
      if (!cms) {
        console.log("Failed to save contact us");
        return userMapper.responseMapping(
          userConst.CODE.INTRNLSRVR,
          userConst.MESSAGE.internalServerError
        );
      } else {
        return userMapper.responseMappingWithData(
          userConst.CODE.Success,
          userConst.MESSAGE.Success,
          cms
        );
      }
    });
  }
}

// User Delete
function deleteAccount(req) {
  let query = {
    _id: req.params.userId,
  };
  let update = {
    tb_user_isDelete: true,
  };
  return userDao.deleteAccount(query, update).then(async (result) => {
    if (result) {
      return userMapper.responseMappingWithData(
        userConst.CODE.Success,
        userConst.MESSAGE.successDeleteUser,
        result
      );
    } else {
      return userMapper.responseMapping(
        userConst.CODE.BadRequest,
        userConst.MESSAGE.failedDeleteUser
      );
    }
  });
}

/**for resend verification code */

function resendCode(req) {
  let userId = req.params.userId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return userMapper.responseMapping(
      userConst.CODE.BadRequest,
      userConst.MESSAGE.InvalidDetails
    );
  } else {
    let userQuery = {
      _id: userId,
    };
    return userDao.getProfile(userQuery).then((userDetails) => {
      if (!userDetails) {
        return userMapper.responseMapping(
          userConst.CODE.DataNotFound,
          userConst.MESSAGE.InvalidCredentials
        );
      } else {
        let verificationCode = Math.floor(
          Math.random() * (999999 - 100000) + 100000
        );
        let verificationCodeForSms = Math.floor(
          Math.random() * (999999 - 100000) + 100000
        );
        var mailOptions = {
          from: process.env.gmailAccount,
          to: userDetails.tb_user_email,
          subject: "Email Verification",
          html: `<p>Hi,</p><p>Please Verify Your Email.</p><p>Verification Code: <b>${verificationCode}</b>.</p>`,
        };
        let obj = {
          tb_user_verificationCode: verificationCode,
          tb_user_verificationCodeTime: Date.now(),
          tb_user_verificationCodeForSms: verificationCodeForSms,
        };

        return userDao
          .updateProfile(userQuery, obj)
          .then(async (userUpdated) => {
            if (userUpdated) {
              await appUtils.sendMail(mailOptions);
              let message =
                userConst.MESSAGE.smsVerifiactionMessage +
                verificationCodeForSms;
              await appUtils.sendSms({
                mobileNumber: userDetails.tb_user_mobile,
                message,
              });
              return userMapper.responseMapping(
                userConst.CODE.Success,
                userConst.MESSAGE.Success
              );
            } else {
              console.log("Failed to update user");
              return userMapper.responseMapping(
                userConst.CODE.INTRNLSRVR,
                userConst.MESSAGE.internalServerError
              );
            }
          });
      }
    });
  }
}

/**for check reset link validty */

function checkResetLink(req) {
  let email = req.params.emailId;

  if (!email) {
    return userMapper.responseMapping(
      userConst.CODE.BadRequest,
      userConst.MESSAGE.InvalidDetails
    );
  } else {
    let userQuery = {
      tb_user_email: email,
    };
    return userDao.getProfile(userQuery).then((userDetails) => {
      if (!userDetails) {
        return userMapper.responseMapping(
          userConst.CODE.DataNotFound,
          userConst.MESSAGE.InvalidCredentials
        );
      } else {
        if (userDetails.tb_user_passwordResetTime + 120000 >= Date.now()) {
          return userMapper.responseMapping(
            userConst.CODE.Success,
            userConst.MESSAGE.Success
          );
        } else {
          return userMapper.responseMapping(
            userConst.CODE.BadRequest,
            userConst.MESSAGE.passwordResetLinkExpired
          );
        }
      }
    });
  }
}

module.exports = {
  loginUser,
  signupUserStep1,
  signupUserStep2,
  signupUserStep3,
  forgetPassword,
  editProfile,
  logoutUser,
  resetPassword,
  getNotificationsList,
  editProfilePicture,
  updatePreferences,

  getNotificationPreference,

  checkBlackListToken,

  getTradeFundPreference,

  getTermsAndPolicy,
  addcontactUs,
  deleteAccount,
  getProfile,

  resendCode,

  checkResetLink,
};
