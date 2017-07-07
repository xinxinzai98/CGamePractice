// TankPlayer2.h: interface for the CTankPlayer2 class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_TANKPLAYER2_H__AC692B48_52D0_4456_A945_D4BD5E39BAC4__INCLUDED_)
#define AFX_TANKPLAYER2_H__AC692B48_52D0_4456_A945_D4BD5E39BAC4__INCLUDED_

#include "TankPlayer.h"

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000

#include "TankPlayer.h"

class CTankPlayer2 : public CTankPlayer  
{
public:
	//main
	CTankPlayer2(const char* szname);
	virtual ~CTankPlayer2();
	void OnMove(int iKey, bool bPress); 
	void OnFire();
	void Init();//初始化
	void OnHeal();//治疗方法
	//Get
	
	//Set
};

#endif // !defined(AFX_TANKPLAYER2_H__AC692B48_52D0_4456_A945_D4BD5E39BAC4__INCLUDED_)
