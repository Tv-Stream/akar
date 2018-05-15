/*
 * AkamaiJWPlayerLoader.js
 * Version - 1.2.4
 *
 * This file is part of the Media Analytics, http://www.akamai.com
 * Media Analytics is a proprietary Akamai software that you may use and modify per the license agreement here:
 * http://www.akamai.com/product/licenses/mediaanalytics.html
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *
 *
 * Created by Vishvesh on 10th June 2016.
 *
 */

function AkamaiJWPlugin(jwPlayer)
{
  // The version of the JW Player Loader
  var VERSION = "1.3.1";

  // The instance of Media Analytics Library
  var akaPlugin = null;

  var isPlayStarted = false;

  var pluginObj = this;

  var isSessionInitiated = false;

  var isFQ = false;

  var isMP = false;

  var isTQ = false;

  // Indicates the current state of the player. Refer "PlayerStateEnum", for possible values.
  var playerState = 0;

  // Storing the instance passed
  var jwPlayerInstance = jwPlayer;

  if (typeof jwPlayer !== 'object'){
    jwPlayerInstance =  jwPlayerInstance();
  }
 
  // The different states the player can be in.
  var PlayerStateEnum = {
    // Indicates that the player is initializing.
    Init: 1,
    // Indicates that the player is playing video.
    Playing: 2,
    // Indicates that the player is paused.
    Pause: 4,
    // Indicates that the player is buffering.
    Rebuffer: 8,
  };

  this.loadMediaAnalytics = function()
  {
    try
    {
      createLibraryInstance();

      jwPlayerInstance.on('beforePlay', function(e){
        if(!isSessionInitiated){
          //Setting playerType for debugging purposes.
          akaPlugin.setData("std:playerType", "JWPlayer-" + jwPlayerInstance.getProvider().name);
          setCustomData();
          akaPlugin.handleSessionInit();//Must be called only when initiating a new play.
          isSessionInitiated = true;
          isPlayStarted = false;
          playerState = PlayerStateEnum.Init;
        }
      });

      jwPlayerInstance.on('play', function(e){
        if(!isPlayStarted){
          pluginObj.setBitrateIndex(jwPlayerInstance.getCurrentQuality());
        }
        isPlayStarted = true;
        if (playerState === PlayerStateEnum.Pause){
          akaPlugin.handleResume();
        }else if (playerState === PlayerStateEnum.Rebuffer){
          akaPlugin.handleBufferEnd();
        }else{
          akaPlugin.handlePlaying();
        }
        playerState = PlayerStateEnum.Playing;
      });

      jwPlayerInstance.on('pause', function(e){
        akaPlugin.handlePause();
        playerState = PlayerStateEnum.Pause;
      });

      jwPlayerInstance.on('buffer', function(e){
        // Ignoring connection rebuffer
        if (playerState != PlayerStateEnum.Init){
          akaPlugin.handleBufferStart();
          playerState = PlayerStateEnum.Rebuffer;
        }
      });

      jwPlayerInstance.on('complete', function(e){
        akaPlugin.handlePlayEnd("JWPlayer.Complete");
        isSessionInitiated = false;
        isPlayStarted = false;
      });

      jwPlayerInstance.on('error', function(e){
        akaPlugin.handleError("JWPlayer.Error:"+e.message);
        isSessionInitiated = false;
        isPlayStarted = false;
      });

      jwPlayerInstance.on('setupError', function(e){
        akaPlugin.handleError("JWPlayer.SetupError:"+e.message);
        isSessionInitiated = false;
        isPlayStarted = false;
      });

      jwPlayerInstance.on('levelsChanged', function(e) {
        pluginObj.setBitrateIndex(e.currentQuality);
      });

      jwPlayerInstance.on('visualQuality', function(e) {
        if (typeof e.level != "undefined" && typeof e.level.bitrate != "undefined"){
          pluginObj.setBitrate(parseInt(e.level.bitrate));
        }
      });

      jwPlayerInstance.on('adImpression', function(e) {
        //JWPlayer provides only one event when Ad starts.
        isFQ = false;isMP = false;isTQ = false;
        akaPlugin.handleAdLoaded({adTitle:e.tag});//Need to send more Ad related custom dimensions.
        akaPlugin.handleAdStarted();
      });

      jwPlayerInstance.on('adTime', function(e) {
        try{
          if(e.duration > 0){
            var adPlayPercent = e.position / e.duration;
            if(!isFQ && adPlayPercent >= 0.25 && adPlayPercent < 0.5){
              akaPlugin.handleAdFirstQuartile();
              isFQ = true;
            }else if(!isMP && adPlayPercent >= 0.5 && adPlayPercent < 0.75){
              akaPlugin.handleAdMidPoint();
              isMP = true;
            }else if(!isTQ && adPlayPercent >= 0.75){
              akaPlugin.handleAdThirdQuartile();
              isTQ = true;
            }
          }
        }catch(e){}
      });

      jwPlayerInstance.on('adComplete', function(e) {
        akaPlugin.handleAdComplete();
      });

      jwPlayerInstance.on('adError', function(e) {
        akaPlugin.handleAdError();
      });

      jwPlayerInstance.on('remove', function(e){
        akaPlugin.handlePlayEnd("JWPlayer.Browser.Close");
      });

    }catch(e){
      console.log(e);
    }
  }

  this.setData = function(name, value){
    if(akaPlugin){
      akaPlugin.setData(name, value);
    }
  }

  this.setBitrateIndex = function(bitrateIndex){
    try{
      var qualityObj = jwPlayerInstance.getQualityLevels()[bitrateIndex];
      var bitrate = parseInt(qualityObj.bitrate);
      if(bitrate < 50000){
        bitrate = bitrate*1000;//Converting kbps to bps
      }
      if(isNaN(bitrate) || !(bitrate>0)){
        if(qualityObj.label && qualityObj.label.toLowerCase().indexOf("kbps") > 0){
          bitrate = parseInt(qualityObj.label)*1000;
        }
      }
      if(bitrate > 0){
        this.setBitrate(bitrate);
      }
    }catch(e){}
  }

  //Set bitrate in bps
  this.setBitrate = function(bitrate){
    if(akaPlugin){
      //console.log("setBitrate:"+bitrate);
      akaPlugin.handleBitRateSwitch(bitrate);
    }
  }

  this.removeAllListeners = function(){
    akaPlugin.handlePlayEnd("JWPlayer.Browser.Close");
    jwPlayerInstance.off('beforePlay');
    jwPlayerInstance.off('play');
    jwPlayerInstance.off('pause');
    jwPlayerInstance.off('buffer');
    jwPlayerInstance.off('complete');
    jwPlayerInstance.off('error');
    jwPlayerInstance.off('setupError');
    jwPlayerInstance.off('levelsChanged');
    jwPlayerInstance.off('adImpression');
    jwPlayerInstance.off('adTime');
    jwPlayerInstance.off('adComplete');
    jwPlayerInstance.off('adError');
    jwPlayerInstance.off('remove');
  }

  function createLibraryInstance(){
    var akaPluginCallBack = {};
    akaPluginCallBack["streamHeadPosition"] = getStreamHeadPosition;
    akaPluginCallBack["streamLength"] = getStreamLength;
    akaPluginCallBack["streamURL"] = getStreamURL;
    akaPluginCallBack["loaderName"] = "JWPlayerLoader";
    akaPluginCallBack["loaderVersion"] = VERSION;

    akaPlugin = new AkaHTML5MediaAnalytics(akaPluginCallBack);
  }

  function getStreamHeadPosition(){
    return jwPlayerInstance.getPosition();
  }

  function getStreamLength(){
    return jwPlayerInstance.getDuration();
  }

  function getStreamURL(){
    var itemIndex = jwPlayerInstance.getPlaylistIndex();
    var item = jwPlayerInstance.getPlaylistItem(itemIndex);
    return item.file;
  }

  function setCustomData(){
    try{
      if(jwPlayerInstance.getPlaylist() && jwPlayerInstance.getPlaylistIndex() > -1){
        var playItem = jwPlayerInstance.getPlaylist()[jwPlayerInstance.getPlaylistIndex()];
        akaPlugin.setData("title", playItem.title);
      }
    }catch(e){
      console.log(e);
    }
  }
  this.loadMediaAnalytics();
}