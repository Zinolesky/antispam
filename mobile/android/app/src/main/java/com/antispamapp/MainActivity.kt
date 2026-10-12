package com.antispamapp

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    /** Name of the JS component registered in index.js */
    override fun getMainComponentName(): String = "AntiSpamApp"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    /**
     * Forwards the ROLE_CALL_SCREENING permission dialog result to CallScreeningModule.
     * This is required for requestScreeningRole() to fire onRoleGranted/onRoleDenied events.
     */
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val module = reactInstanceManager
            ?.currentReactContext
            ?.getNativeModule(CallScreeningModule::class.java)
        module?.handleActivityResult(requestCode, resultCode)
    }

    /**
     * Passes incoming deep link intents (e.g. antispam://auth?...) to React Native's Linking module
     * when the activity is already running (launchMode="singleTask").
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }
}
