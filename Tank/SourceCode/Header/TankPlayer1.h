// TankPlayer1.h: interface for the CTankPlayer1 class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_TANKPLAYER1_H__3633BF93_D762_4D59_972B_DE50DF34F23F__INCLUDED_)
#define AFX_TANKPLAYER1_H__3633BF93_D762_4D59_972B_DE50DF34F23F__INCLUDED_

#include "TankPlayer.h"

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000

class CTankPlayer1 : public CTankPlayer  
{
private:

public:
	CTankPlayer1(const char* szname);
	virtual ~CTankPlayer1();
	void OnMove(int iKey, bool bPress); 
	void OnFire();
	void Init();//初始化

};

#endif // !defined(AFX_TANKPLAYER1_H__3633BF93_D762_4D59_972B_DE50DF34F23F__INCLUDED_)
